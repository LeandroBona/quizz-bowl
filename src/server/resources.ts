import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { resources, schemas, type Resource } from "@/lib/validations";
import { participantIdentity } from "@/lib/participant-key";
import { compareCompetitionMatches } from "@/lib/match-order";
import { changeMembership } from "@/server/membership";
import { ApiError } from "@/server/errors";

export { ApiError } from "@/server/errors";
export function isResource(value: string): value is Resource { return resources.includes(value as Resource); }
export function parseBody(resource: Resource, body: unknown): Record<string, any> {
  return schemas[resource].parse(body) as Record<string, any>;
}
function date(value: string | null) { return value ? new Date(value) : null; }
async function eventExists(eventId: string) {
  if (!await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
}
async function verifyTeam(eventId: string, teamId: string | null) {
  if (teamId && !await prisma.team.findFirst({ where: { id: teamId, eventId }, select: { id: true } })) throw new ApiError(400, "Equipe não pertence ao evento.");
}
async function verifyPhase(eventId: string, phaseId: string) {
  if (!await prisma.coursePhase.findFirst({ where: { id: phaseId, eventId }, select: { id: true } })) throw new ApiError(400, "Fase não pertence ao evento.");
}
function participantDedupeKey(input: Record<string, any>) {
  return createHash("sha256").update(participantIdentity(input.name, input.phaseId, input.className)).digest("hex");
}
async function verifyGroup(eventId: string, groupId: string | null) {
  if (groupId && !await prisma.group.findFirst({ where: { id: groupId, eventId }, select: { id: true } })) throw new ApiError(400, "Grupo não pertence ao evento.");
}
export async function listRecords(resource: Resource, eventId: string | null) {
  if (resource !== "events" && !eventId) throw new ApiError(400, "Selecione um evento.");
  switch (resource) {
    case "events": return prisma.event.findMany({ orderBy: { createdAt: "desc" } });
    case "participants": return prisma.participant.findMany({ where: { eventId: eventId! }, include: { phase: { select: { id: true, name: true } }, membership: { include: { team: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } });
    case "teams": return prisma.team.findMany({ where: { eventId: eventId! }, include: { members: { include: { participant: { include: { phase: { select: { id: true, name: true } } } } } }, _count: { select: { members: true } } }, orderBy: { name: "asc" } });
    case "questions": return prisma.question.findMany({ where: { eventId: eventId! }, orderBy: { createdAt: "desc" } });
    case "groups": return prisma.group.findMany({ where: { eventId: eventId! }, include: { teams: { include: { team: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } });
    case "matches": return (await prisma.match.findMany({ where: { eventId: eventId! }, include: { homeTeam: { select: { id: true, name: true } }, awayTeam: { select: { id: true, name: true } }, group: { select: { id: true, name: true } }, session: { select: { matchId: true } }, bracketNode: { select: { id: true } } } })).sort(compareCompetitionMatches).map((match, index) => ({ ...match, sequence: index + 1 }));
  }
}
export async function createRecord(resource: Resource, input: Record<string, any>) {
  if (resource !== "events") await eventExists(input.eventId);
  switch (resource) {
    case "events": return prisma.event.create({ data: { ...input, startsAt: date(input.startsAt), endsAt: date(input.endsAt) } as Prisma.EventUncheckedCreateInput });
    case "participants":
      await verifyTeam(input.eventId, input.teamId);
      await verifyPhase(input.eventId, input.phaseId);
      if (input.teamId && input.participationStatus !== "ACTIVE") throw new ApiError(400, "Somente participantes ativos podem entrar em equipes.");
      return prisma.$transaction(async tx => {
        const participant = await tx.participant.create({ data: { eventId: input.eventId, name: input.name, email: input.email, institution: input.institution, phaseId: input.phaseId, className: input.className, participationStatus: input.participationStatus, dedupeKey: participantDedupeKey(input) } });
        if (input.teamId) await changeMembership(tx, participant.id, input.eventId, input.teamId);
        return participant;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    case "teams": return prisma.team.create({ data: input as Prisma.TeamUncheckedCreateInput });
    case "questions": return prisma.question.create({ data: input as Prisma.QuestionUncheckedCreateInput });
    case "groups":
      for (const id of input.teamIds) await verifyTeam(input.eventId, id);
      return prisma.group.create({ data: { eventId: input.eventId, name: input.name, stage: input.stage, teams: { create: input.teamIds.map((teamId: string) => ({ teamId })) } } });
    case "matches":
      await verifyTeam(input.eventId, input.homeTeamId); await verifyTeam(input.eventId, input.awayTeamId); await verifyGroup(input.eventId, input.groupId);
      if (input.status !== "SCHEDULED" || input.homeScore !== 0 || input.awayScore !== 0) throw new ApiError(400, "Novas partidas devem começar agendadas e com placar zerado.");
      if (input.groupId && await prisma.group.findFirst({ where: { id: input.groupId, phaseId: { not: null } } })) throw new ApiError(409, "Gere os confrontos da fase pela tela Grupos.");
      return prisma.match.create({ data: { ...input, scheduledAt: date(input.scheduledAt) } as Prisma.MatchUncheckedCreateInput });
  }
}
async function assertRecord(resource: Resource, id: string, eventId: string | null) {
  if (resource === "events") { if (!await prisma.event.findUnique({ where: { id }, select: { id: true } })) throw new ApiError(404, "Registro não encontrado."); return; }
  if (!eventId) throw new ApiError(400, "Selecione um evento.");
  const record = await ({
    participants: () => prisma.participant.findFirst({ where: { id, eventId }, select: { id: true } }),
    teams: () => prisma.team.findFirst({ where: { id, eventId }, select: { id: true } }),
    questions: () => prisma.question.findFirst({ where: { id, eventId }, select: { id: true } }),
    groups: () => prisma.group.findFirst({ where: { id, eventId }, select: { id: true } }),
    matches: () => prisma.match.findFirst({ where: { id, eventId }, select: { id: true } })
  }[resource]());
  if (!record) throw new ApiError(404, "Registro não encontrado neste evento.");
}
export async function updateRecord(resource: Resource, id: string, input: Record<string, any>) {
  await assertRecord(resource, id, resource === "events" ? null : input.eventId);
  switch (resource) {
    case "events": return prisma.event.update({ where: { id }, data: { ...input, startsAt: date(input.startsAt), endsAt: date(input.endsAt) } });
    case "participants":
      await verifyTeam(input.eventId, input.teamId);
      await verifyPhase(input.eventId, input.phaseId);
      if (input.teamId && input.participationStatus !== "ACTIVE") throw new ApiError(400, "Somente participantes ativos podem entrar em equipes.");
      return prisma.$transaction(async tx => {
        const participant = await tx.participant.update({ where: { id }, data: { name: input.name, email: input.email, institution: input.institution, phaseId: input.phaseId, className: input.className, participationStatus: input.participationStatus, dedupeKey: participantDedupeKey(input) } });
        await changeMembership(tx, id, input.eventId, input.teamId);
        return participant;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    case "teams": return prisma.team.update({ where: { id }, data: { name: input.name, institution: input.institution, color: input.color } });
    case "questions": return prisma.question.update({ where: { id }, data: { statement: input.statement, answer: input.answer, category: input.category, difficulty: input.difficulty, points: input.points, status: input.status } });
    case "groups":
      if (await prisma.group.findFirst({ where: { id, phaseId: { not: null } } })) throw new ApiError(409, "Grupos confirmados devem ser gerenciados na tela Grupos.");
      for (const teamId of input.teamIds) await verifyTeam(input.eventId, teamId);
      return prisma.group.update({ where: { id }, data: { name: input.name, stage: input.stage, teams: { deleteMany: {}, create: input.teamIds.map((teamId: string) => ({ teamId })) } } });
    case "matches":
      if (await prisma.bracketNode.findUnique({ where: { matchId: id }, select: { id: true } })) throw new ApiError(409, "Use o chaveamento ou a mediação para alterar esta partida eliminatória.");
      if (await prisma.matchSession.findUnique({ where: { matchId: id }, select: { matchId: true } })) throw new ApiError(409, "Use a tela da partida para alterar resultado ou status.");
      if (await prisma.match.findFirst({ where: { id, group: { phaseId: { not: null } } } })) throw new ApiError(409, "Use a tela Grupos para registrar resultados desta fase.");
      await verifyTeam(input.eventId, input.homeTeamId); await verifyTeam(input.eventId, input.awayTeamId); await verifyGroup(input.eventId, input.groupId);
      return prisma.match.update({ where: { id }, data: { groupId: input.groupId, homeTeamId: input.homeTeamId, awayTeamId: input.awayTeamId, scheduledAt: date(input.scheduledAt), round: input.round, status: input.status, homeScore: input.homeScore, awayScore: input.awayScore, officialAt: null } });
  }
}
export async function deleteRecord(resource: Resource, id: string, eventId: string | null) {
  await assertRecord(resource, id, eventId);
  switch (resource) {
    case "events": return prisma.$transaction(async tx => { await tx.bracket.deleteMany({ where: { eventId: id } }); await tx.participant.deleteMany({ where: { eventId: id } }); return tx.event.delete({ where: { id } }); });
    case "participants": {
      const membership = await prisma.teamMember.findUnique({ where: { participantId: id }, select: { id: true } });
      if (membership) throw new ApiError(409, "Remova o participante da equipe antes de excluí-lo.");
      return prisma.participant.delete({ where: { id } });
    }
    case "teams": {
      const team = await prisma.team.findUnique({ where: { id }, include: { _count: { select: { members: true, groups: true, homeMatches: true, awayMatches: true, bracketSlots: true, bracketWins: true } } } });
      if (team && Object.values(team._count).some(count => count > 0)) throw new ApiError(409, "A equipe possui integrantes, grupos, partidas ou vagas no chaveamento. Remova esses vínculos antes de excluí-la.");
      return prisma.team.delete({ where: { id } });
    }
    case "questions": return prisma.question.delete({ where: { id } });
    case "groups":
      if (await prisma.group.findFirst({ where: { id, phaseId: { not: null } } })) throw new ApiError(409, "Grupos confirmados não podem ser excluídos pelo cadastro geral.");
      return prisma.group.delete({ where: { id } });
    case "matches":
      if (await prisma.bracketNode.findUnique({ where: { matchId: id }, select: { id: true } })) throw new ApiError(409, "Partidas eliminatórias devem ser alteradas pelo chaveamento.");
      if (await prisma.matchSession.findUnique({ where: { matchId: id }, select: { matchId: true } })) throw new ApiError(409, "Uma partida iniciada possui histórico e não pode ser excluída pelo cadastro geral.");
      if (await prisma.match.findFirst({ where: { id, group: { phaseId: { not: null } } } })) throw new ApiError(409, "Confrontos gerados pela fase não podem ser excluídos pelo cadastro geral.");
      return prisma.match.delete({ where: { id } });
  }
}
