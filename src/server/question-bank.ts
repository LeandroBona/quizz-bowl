import { Prisma, type Question } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { questionInputSchema } from "@/lib/validations";

export type QuestionInput = ReturnType<typeof questionInputSchema.parse>;
export function questionIdentity(eventId: string | null, type: string, statement: string) {
  const normalized = statement.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return createHash("sha256").update(`${eventId || "shared"}|${type}|${normalized}`).digest("hex");
}
export const questionSelect = {
  id: true, eventId: true, statement: true, type: true, alternatives: true, answer: true,
  explanation: true, category: true, difficulty: true, points: true, timeSeconds: true,
  imageUrl: true, isActive: true, createdAt: true, updatedAt: true
} satisfies Prisma.QuestionSelect;

export async function assertEvent(eventId: string) {
  if (!await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
}

export function questionData(input: QuestionInput) {
  return {
    eventId: input.eventId,
    statement: input.statement,
    type: input.type,
    alternatives: input.type === "MULTIPLE_CHOICE" ? input.alternatives : Prisma.JsonNull,
    answer: input.answer,
    explanation: input.explanation,
    category: input.category,
    difficulty: input.difficulty,
    points: input.points,
    timeSeconds: input.timeSeconds,
    imageUrl: input.imageUrl,
    isActive: input.isActive,
    dedupeKey: questionIdentity(input.eventId, input.type, input.statement),
    status: input.isActive ? "READY" as const : "ARCHIVED" as const
  };
}

export function normalizeQuestion(question: Question) {
  return { ...question, alternatives: Array.isArray(question.alternatives) ? question.alternatives : [] };
}

export async function listQuestions(eventId: string, filters: URLSearchParams) {
  await assertEvent(eventId);
  const scope = filters.get("scope");
  const type = filters.get("type");
  const difficulty = filters.get("difficulty");
  const scopeWhere: Prisma.QuestionWhereInput = scope === "shared" ? { eventId: null } : scope === "event" ? { eventId } : { OR: [{ eventId }, { eventId: null }] };
  const where: Prisma.QuestionWhereInput = {
    ...scopeWhere,
    ...(type && ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"].includes(type) ? { type: type as Question["type"] } : {}),
    ...(difficulty && ["EASY", "MEDIUM", "HARD"].includes(difficulty) ? { difficulty: difficulty as Question["difficulty"] } : {}),
    ...(filters.get("category") ? { category: filters.get("category") } : {}),
    ...(filters.get("q") ? { statement: { contains: filters.get("q")! } } : {})
  };
  const rows = await prisma.question.findMany({ where, include: { _count: { select: { uses: { where: { eventId } }, reservations: { where: { eventId } } } } }, orderBy: { createdAt: "desc" } });
  return rows.map(row => ({ ...normalizeQuestion(row), usedInEvent: row._count.uses > 0 || row._count.reservations > 0, _count: undefined }));
}

export async function createQuestion(input: QuestionInput) {
  if (input.eventId) await assertEvent(input.eventId);
  return prisma.question.create({ data: questionData(input), select: questionSelect });
}

export async function updateQuestion(id: string, input: QuestionInput) {
  const current = await prisma.question.findUnique({ where: { id }, include: { _count: { select: { uses: true, reservations: true } } } });
  if (!current) throw new ApiError(404, "Questão não encontrada.");
  if (current.eventId !== input.eventId) throw new ApiError(409, "O escopo da questão não pode ser alterado. Duplique-a para outro banco.");
  const data = questionData(input);
  if (current._count.uses > 0 || current._count.reservations > 0) {
    const changed = current.statement !== data.statement || current.type !== data.type || current.answer !== data.answer ||
      JSON.stringify(current.alternatives || []) !== JSON.stringify(input.type === "MULTIPLE_CHOICE" ? input.alternatives : []) ||
      current.explanation !== data.explanation || current.category !== data.category || current.difficulty !== data.difficulty ||
      current.points !== data.points || current.timeSeconds !== data.timeSeconds || current.imageUrl !== data.imageUrl;
    if (changed) throw new ApiError(409, "Esta questão já foi usada. Apenas a situação pode ser alterada; duplique-a para editar o conteúdo.");
  }
  return prisma.question.update({ where: { id }, data, select: questionSelect });
}

export async function deleteQuestion(id: string, eventId: string) {
  const question = await prisma.question.findFirst({ where: { id, OR: [{ eventId }, { eventId: null }] }, include: { _count: { select: { uses: true, reservations: true } } } });
  if (!question) throw new ApiError(404, "Questão não encontrada neste banco.");
  if (question._count.uses || question._count.reservations) throw new ApiError(409, "Questão já utilizada em partida. Desative-a para preservar o histórico.");
  await prisma.question.delete({ where: { id } });
}

export async function duplicateQuestion(id: string, eventId: string) {
  const original = await prisma.question.findFirst({ where: { id, OR: [{ eventId }, { eventId: null }] } });
  if (!original) throw new ApiError(404, "Questão não encontrada neste banco.");
  const copyStatement = `${original.statement} (cópia ${randomUUID().slice(0, 8)})`;
  return prisma.question.create({ data: {
    eventId: original.eventId, statement: copyStatement, type: original.type,
    alternatives: original.alternatives ?? Prisma.JsonNull, answer: original.answer, explanation: original.explanation,
    category: original.category, difficulty: original.difficulty, points: original.points,
    timeSeconds: original.timeSeconds, imageUrl: original.imageUrl, isActive: false, status: "ARCHIVED",
    dedupeKey: questionIdentity(original.eventId, original.type, copyStatement)
  }, select: questionSelect });
}
