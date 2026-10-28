import { Prisma, type PresentationMode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { remainingTimerMs } from "@/lib/match-engine";
import { presentationQuestion } from "@/lib/presentation-public";
import { phaseState } from "@/server/group-stage";
import { bracketRoundName } from "@/lib/bracket";
import { compareCompetitionMatches } from "@/lib/match-order";

const modes = ["OPENING", "TEAMS", "QUESTION", "REVEAL", "SCORE", "STANDINGS", "BRACKET", "CHAMPION"] as const;
export const presentationInput = z.object({
  eventId: z.string().min(1),
  mode: z.enum(modes),
  matchId: z.string().min(1).nullable(),
  logoUrl: z.union([z.url().max(2000).refine(value => /^https?:\/\//i.test(value), "Use uma URL HTTP ou HTTPS."), z.literal("")]).nullable(),
  welcomeMessage: z.string().trim().max(500).nullable(),
  showQuestionScore: z.boolean(),
  showExplanation: z.boolean(),
  soundsEnabled: z.boolean(),
});
type Input = z.infer<typeof presentationInput>;

export async function presentationControl(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, presentation: true } });
  if (!event) throw new ApiError(404, "Evento não encontrado.");
  const matches = (await prisma.match.findMany({ where: { eventId, status: { not: "CANCELLED" } }, select: { id: true, status: true, round: true, scheduledAt: true, createdAt: true, group: { select: { name: true } }, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } })).sort(compareCompetitionMatches);
  return { event: { id: event.id, name: event.name }, presentation: event.presentation ?? { mode: "OPENING", matchId: null, logoUrl: null, welcomeMessage: null, showQuestionScore: true, showExplanation: false, soundsEnabled: false, revision: 0 }, matches };
}

export async function updatePresentation(input: Input) {
  return prisma.$transaction(async tx => {
    if (!await tx.event.findUnique({ where: { id: input.eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
    if (["TEAMS", "QUESTION", "REVEAL", "SCORE"].includes(input.mode) && !input.matchId) throw new ApiError(400, "Selecione uma partida para esta tela.");
    if (input.matchId) {
      const match = await tx.match.findFirst({ where: { id: input.matchId, eventId: input.eventId, status: { not: "CANCELLED" } }, select: { id: true, status: true, session: { select: { currentPosition: true } } } });
      if (!match) throw new ApiError(400, "Partida não encontrada neste evento.");
      if (input.mode === "QUESTION" && (match.status !== "LIVE" || !match.session?.currentPosition)) throw new ApiError(409, "Apresente uma questão na mediação antes de abrir a tela de pergunta.");
      if (input.mode === "REVEAL") {
        if (match.status !== "LIVE" || !match.session?.currentPosition) throw new ApiError(409, "Não há questão em andamento para revelar.");
        const use = await tx.questionUse.findFirst({ where: { matchId: match.id, position: match.session.currentPosition }, select: { status: true } });
        if (use?.status !== "REVEALED") throw new ApiError(409, "Revele a resposta na mediação antes de exibi-la no telão.");
      }
    }
    if (input.mode === "CHAMPION") {
      const bracket = await tx.bracket.findFirst({ where: { eventId: input.eventId }, orderBy: { createdAt: "desc" }, select: { id: true, bracketSize: true } });
      const final = bracket ? await tx.bracketNode.findFirst({ where: { bracketId: bracket.id, roundIndex: Math.log2(bracket.bracketSize) - 1, match: { officialAt: { not: null } }, winnerTeamId: { not: null } }, select: { id: true } }) : null;
      if (!final) throw new ApiError(409, "Homologue a final antes de apresentar a campeã.");
    }
    const { eventId, ...fields } = input;
    return tx.eventPresentation.upsert({ where: { eventId }, create: { eventId, ...fields, logoUrl: fields.logoUrl || null }, update: { ...fields, logoUrl: fields.logoUrl || null, revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function teamPublic(team: { id: string; name: string; color: string | null; members: { participant: { name: string; phase: { name: string } | null } }[] }, includeMembers: boolean) {
  return { id: team.id, name: team.name, color: team.color, ...(includeMembers ? { members: team.members.map(member => ({ name: member.participant.name, phase: member.participant.phase?.name ?? null })) } : {}) };
}

export async function publicPresentation(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, description: true, presentation: true } });
  if (!event) throw new ApiError(404, "Evento não encontrado.");
  const config = event.presentation;
  const mode: PresentationMode = config?.mode ?? "OPENING";
  const now = new Date();
  const base = {
    event: { id: event.id, name: event.name, description: event.description, logoUrl: config?.logoUrl ?? null, welcomeMessage: config?.welcomeMessage ?? null },
    mode,
    revision: config?.revision ?? 0,
    serverNow: now.toISOString(),
    soundsEnabled: config?.soundsEnabled ?? false,
    appearance: { accentColor: config?.accentColor ?? "#38BDF8", backgroundColor: config?.backgroundColor ?? "#06142E" },
  };
  if (["TEAMS", "QUESTION", "REVEAL", "SCORE"].includes(mode)) {
    const match = config?.matchId ? await prisma.match.findFirst({ where: { id: config.matchId, eventId, status: { not: "CANCELLED" } }, include: {
      homeTeam: { include: { members: { include: { participant: { select: { name: true, phase: { select: { name: true } } } } } } } },
      awayTeam: { include: { members: { include: { participant: { select: { name: true, phase: { select: { name: true } } } } } } } },
      group: { select: { name: true } }, bracketNode: { select: { id: true } }, session: true,
    } }) : null;
    if (!match) return { ...base, match: null, question: null };
    const includeMembers = mode === "TEAMS";
    const showScore = mode !== "QUESTION" || config?.showQuestionScore !== false;
    const summary = {
      id: match.id, status: match.status, round: match.group?.name ?? match.round ?? "Partida", official: Boolean(match.officialAt),
      homeTeam: teamPublic(match.homeTeam, includeMembers), awayTeam: teamPublic(match.awayTeam, includeMembers),
      ...(showScore ? { homeScore: match.homeScore, awayScore: match.awayScore } : {}),
      position: match.session?.currentPosition ?? null,
      scoringFormat: match.bracketNode ? "KNOCKOUT" as const : "GROUP" as const,
      turnTeamId: match.session?.turnTeamId ?? null,
      timer: match.session ? { state: match.session.timerState, remainingMs: remainingTimerMs(match.session, now), serverNow: now.toISOString() } : null,
    };
    if (mode !== "QUESTION" && mode !== "REVEAL") return { ...base, match: summary, question: null };
    if (match.status !== "LIVE" || !match.session?.currentPosition) return { ...base, match: summary, question: null };
    const revealed = mode === "REVEAL";
    const use = await prisma.questionUse.findFirst({ where: { matchId: match.id, position: match.session.currentPosition }, select: {
      position: true, awardedPoints: true, status: true,
      question: { select: { statement: true, type: true, alternatives: true, difficulty: true, category: true, imageUrl: true, ...(revealed ? { answer: true, explanation: true } : {}) } },
    } });
    if (!use) return { ...base, match: summary, question: null };
    const question = presentationQuestion({ position: use.position, points: 10, revealed: use.status === "REVEALED", ...use.question }, mode, config?.showExplanation ?? false);
    const answers = revealed && use.status === "REVEALED" ? await prisma.answer.findMany({ where: { matchId: match.id, assignment: { position: use.position } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { points: true, team: { select: { name: true } } } }) : [];
    const decisiveAnswer = answers.find(answer => answer.points > 0) ?? answers[0];
    return { ...base, match: summary, question, ...(decisiveAnswer ? { effect: { correct: decisiveAnswer.points > 0, teamName: decisiveAnswer.team.name } } : {}) };
  }
  if (mode === "STANDINGS") {
    const phase = await prisma.groupPhase.findFirst({ where: { eventId, confirmedAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
    const state = phase ? await phaseState(eventId, phase.id) : null;
    const recent = await prisma.match.findMany({ where: { eventId, officialAt: { not: null }, status: "FINISHED" }, orderBy: { officialAt: "desc" }, take: 6, select: { id: true, homeScore: true, awayScore: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, group: { select: { name: true } }, round: true } });
    return { ...base, phaseName: phase?.name ?? null, groups: state?.groups.map(group => ({ name: group.name, standings: group.standings.map(row => ({ teamId: row.teamId, name: row.name, position: row.position, played: row.played, points: row.points, diff: row.diff, qualification: row.qualification })) })) ?? [], recent: recent.map(match => ({ id: match.id, home: match.homeTeam.name, away: match.awayTeam.name, homeScore: match.homeScore, awayScore: match.awayScore, round: match.group?.name ?? match.round ?? "Partida" })) };
  }
  if (mode === "BRACKET" || mode === "CHAMPION") {
    const bracket = await prisma.bracket.findFirst({ where: { eventId }, orderBy: { createdAt: "desc" }, select: { id: true, bracketSize: true, teamCount: true, nodes: { orderBy: [{ roundIndex: "asc" }, { position: "asc" }], select: { id: true, roundIndex: true, position: true, winnerTeamId: true, winnerTeam: { select: { id: true, name: true, color: true, members: { include: { participant: { select: { name: true, phase: { select: { name: true } } } } } } } }, slots: { orderBy: { side: "asc" }, select: { id: true, team: { select: { id: true, name: true } } } }, match: { select: { status: true, officialAt: true, homeScore: true, awayScore: true } } } } } });
    if (!bracket) return { ...base, bracket: null, champion: null };
    const championNode = bracket.nodes.at(-1);
    const champion = championNode?.match?.officialAt && championNode.winnerTeam ? teamPublic(championNode.winnerTeam, true) : null;
    if (mode === "CHAMPION") return { ...base, champion };
    return { ...base, bracket: { rounds: Array.from({ length: Math.log2(bracket.bracketSize) }, (_, roundIndex) => ({ name: bracketRoundName(bracket.bracketSize, bracket.teamCount, roundIndex), matches: bracket.nodes.filter(node => node.roundIndex === roundIndex).map(node => ({ id: node.id, position: node.position, home: node.slots[0]?.team?.name ?? null, away: node.slots[1]?.team?.name ?? null, winnerTeamId: node.match?.officialAt || !node.match ? node.winnerTeamId : null, homeTeamId: node.slots[0]?.team?.id ?? null, awayTeamId: node.slots[1]?.team?.id ?? null, homeScore: node.match?.officialAt ? node.match.homeScore : null, awayScore: node.match?.officialAt ? node.match.awayScore : null, status: node.match?.officialAt ? "OFFICIAL" : node.match?.status ?? (node.winnerTeamId ? "BYE" : "PENDING") })) })) }, champion: null };
  }
  return base;
}
