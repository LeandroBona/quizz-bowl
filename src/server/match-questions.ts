import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { selectBalancedQuestions } from "@/lib/question-selection";
import { publicQuestion } from "@/lib/question-public";
import type { z } from "zod";
import { questionDrawSchema } from "@/lib/validations";

type DrawInput = z.infer<typeof questionDrawSchema>;
const questionFields = { id: true, statement: true, type: true, alternatives: true, answer: true, explanation: true, category: true, difficulty: true, timeSeconds: true, imageUrl: true } as const;

export async function drawMatchQuestions(matchId: string, input: DrawInput) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const match = await tx.match.findFirst({ where: { id: matchId, eventId: input.eventId }, select: { id: true, status: true } });
        if (!match) throw new ApiError(404, "Partida não encontrada neste evento.");
        if (match.status !== "SCHEDULED") throw new ApiError(409, "Associe questões antes de iniciar a partida.");
        const settings = await tx.questionSettings.findUnique({ where: { eventId: input.eventId } });
        const existing = await tx.questionUse.findMany({ where: { matchId }, select: { questionId: true, position: true } });
        const candidates = await tx.question.findMany({ where: {
          isActive: true,
          OR: [{ eventId: input.eventId }, { eventId: null }],
          ...(input.category ? { category: input.category } : {}),
          ...(input.difficulty !== "ALL" ? { difficulty: input.difficulty } : {}),
          ...(existing.length ? { id: { notIn: existing.map(item => item.questionId) } } : {}),
          ...(settings?.noRepeat !== false ? { uses: { none: { eventId: input.eventId } }, reservations: { none: { eventId: input.eventId } } } : {})
        }, select: { ...questionFields, points: true } });
        let picked: typeof candidates;
        try { picked = selectBalancedQuestions(candidates, input.count, input.seed || randomUUID()); }
        catch (error) { throw new ApiError(409, error instanceof Error ? error.message : "Questões insuficientes."); }
        let position = existing.reduce((maximum, item) => Math.max(maximum, item.position), 0);
        const created = [];
        for (const question of picked) {
          if (settings?.noRepeat !== false) await tx.eventQuestionReservation.create({ data: { eventId: input.eventId, questionId: question.id } });
          const awardedPoints = settings?.pointsMode === "FIXED" ? settings.fixedPoints : question.difficulty === "EASY" ? settings?.easyPoints ?? 10 : question.difficulty === "HARD" ? settings?.hardPoints ?? 30 : settings?.mediumPoints ?? 20;
          const assignment = await tx.questionUse.create({ data: { eventId: input.eventId, matchId, questionId: question.id, position: ++position, awardedPoints }, include: { question: { select: questionFields } } });
          created.push(assignment);
        }
        await tx.matchEvent.create({ data: { matchId, kind: "QUESTIONS_DRAWN", details: { positions: created.map(item => item.position), questionIds: created.map(item => item.questionId) } } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        if (attempt < 3) continue;
        throw new ApiError(409, "O banco de questões mudou durante o sorteio. Tente novamente.");
      }
      throw error;
    }
  }
  throw new ApiError(409, "Não foi possível concluir o sorteio.");
}

export async function listMatchQuestions(matchId: string, eventId: string, publicView: boolean) {
  const match = await prisma.match.findFirst({ where: { id: matchId, eventId }, select: { id: true, status: true, session: { select: { currentPosition: true } } } });
  if (!match) throw new ApiError(404, "Partida não encontrada neste evento.");
  if (publicView && (match.status !== "LIVE" || !match.session?.currentPosition)) return [];
  const rows = await prisma.questionUse.findMany({ where: { matchId, eventId }, include: { question: { select: questionFields } }, orderBy: { position: "asc" } });
  return publicView ? rows.filter(row => row.position === match.session!.currentPosition).map(publicQuestion) : rows;
}

export async function revealMatchQuestion(matchId: string, assignmentId: string, eventId: string) {
  const assignment = await prisma.questionUse.findFirst({ where: { id: assignmentId, matchId, eventId }, select: { id: true, position: true } });
  if (!assignment) throw new ApiError(404, "Questão não encontrada nesta partida.");
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, session: { select: { currentPosition: true } } } });
  if (match?.session) {
    if (match.status !== "LIVE" || match.session.currentPosition !== assignment.position) throw new ApiError(409, "Somente a questão atual pode ser revelada durante a partida.");
    const { performMatchAction } = await import("@/server/match-session");
    await performMatchAction(matchId, { action: "reveal", eventId });
    return prisma.questionUse.findUniqueOrThrow({ where: { id: assignmentId }, include: { question: { select: questionFields } } });
  }
  return prisma.$transaction(async tx => {
    const updated = await tx.questionUse.update({ where: { id: assignmentId }, data: { status: "REVEALED", revealedAt: new Date() }, include: { question: { select: questionFields } } });
    await tx.matchEvent.create({ data: { matchId, kind: "REVEAL", details: { position: assignment.position, assignmentId } } });
    return updated;
  });
}

export async function assignMatchQuestions(matchId: string, eventId: string, questionIds: string[]) {
  if (!questionIds.length || questionIds.length > 100 || new Set(questionIds).size !== questionIds.length) throw new ApiError(400, "Selecione de 1 a 100 questões diferentes.");
  return prisma.$transaction(async tx => {
    const match = await tx.match.findFirst({ where: { id: matchId, eventId }, select: { status: true } });
    if (!match) throw new ApiError(404, "Partida não encontrada neste evento.");
    if (match.status !== "SCHEDULED") throw new ApiError(409, "Associe questões antes de iniciar a partida.");
    const settings = await tx.questionSettings.findUnique({ where: { eventId } });
    const questions = await tx.question.findMany({ where: { id: { in: questionIds }, isActive: true, OR: [{ eventId }, { eventId: null }] }, select: { ...questionFields, points: true, uses: { where: { eventId }, select: { id: true } }, reservations: { where: { eventId }, select: { eventId: true } } } });
    if (questions.length !== questionIds.length) throw new ApiError(400, "Alguma questão não está ativa ou disponível neste evento.");
    const byId = new Map(questions.map(question => [question.id, question]));
    const existing = await tx.questionUse.findMany({ where: { matchId }, select: { questionId: true, position: true } });
    if (questionIds.some(id => existing.some(row => row.questionId === id))) throw new ApiError(409, "Uma questão já está associada a esta partida.");
    if (settings?.noRepeat !== false && questions.some(question => question.uses.length || question.reservations.length)) throw new ApiError(409, "Uma questão já foi usada neste evento.");
    let position = existing.reduce((max,row) => Math.max(max,row.position),0);
    const created=[];
    for (const questionId of questionIds) {
      const question=byId.get(questionId)!;
      if (settings?.noRepeat !== false) await tx.eventQuestionReservation.create({ data: { eventId, questionId } });
      const awardedPoints=settings?.pointsMode==="FIXED"?settings.fixedPoints:question.difficulty==="EASY"?settings?.easyPoints??10:question.difficulty==="HARD"?settings?.hardPoints??30:settings?.mediumPoints??20;
      created.push(await tx.questionUse.create({ data: { eventId, matchId, questionId, position: ++position, awardedPoints }, include: { question: { select: questionFields } } }));
    }
    await tx.matchEvent.create({ data: { matchId, kind: "QUESTIONS_ASSIGNED", details: { positions: created.map(item => item.position), questionIds } } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
}
