import { Prisma } from "@prisma/client";
import { ApiError } from "@/server/errors";

export async function changeMembership(tx: Prisma.TransactionClient, participantId: string, eventId: string, teamId: string | null) {
  const participant = await tx.participant.findFirst({ where: { id: participantId, eventId }, select: { id: true, participationStatus: true } });
  if (!participant) throw new ApiError(404, "Participante não encontrado neste evento.");
  const current = await tx.teamMember.findUnique({ where: { participantId }, include: { team: { include: { _count: { select: { members: true } } } } } });
  if (current?.teamId === teamId) return;
  if (teamId && participant.participationStatus !== "ACTIVE") throw new ApiError(409, "Somente participantes ativos podem entrar em equipes.");
  if (current?.team.minMembers != null && current.team._count.members <= current.team.minMembers) throw new ApiError(409, `A equipe ${current.team.name} precisa manter pelo menos ${current.team.minMembers} integrantes. Faça uma troca entre equipes.`);
  if (teamId) {
    const target = await tx.team.findFirst({ where: { id: teamId, eventId }, include: { _count: { select: { members: true } } } });
    if (!target) throw new ApiError(400, "Equipe não pertence ao evento.");
    if (target.maxMembers != null && target._count.members >= target.maxMembers) throw new ApiError(409, `A equipe ${target.name} já atingiu o máximo de ${target.maxMembers} integrantes. Faça uma troca entre equipes.`);
    await tx.teamMember.upsert({ where: { participantId }, create: { participantId, teamId }, update: { teamId } });
  } else await tx.teamMember.deleteMany({ where: { participantId } });
}
