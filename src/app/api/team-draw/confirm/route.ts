import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { drawParticipants, stateSignature, addAvailableNames } from "@/server/team-draw";
import { drawTeams } from "@/lib/team-draw";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/resources";
import { drawConfigSchema } from "@/lib/validations";
export const runtime = "nodejs";
const confirmSchema = drawConfigSchema.extend({ seed: z.string().min(1).max(200), signature: z.string().length(64) });
export async function POST(request: Request) {
  try {
    const input = confirmSchema.parse(await request.json());
    const result = await prisma.$transaction(async tx => {
      if (!await tx.event.findUnique({ where: { id: input.eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
      const records = await tx.participant.findMany({ where: { eventId: input.eventId, participationStatus: "ACTIVE", membership: { is: null } }, select: { id: true, name: true, phaseId: true, updatedAt: true, phase: { select: { name: true } } }, orderBy: { id: "asc" } });
      const existingNames = (await tx.team.findMany({ where: { eventId: input.eventId }, select: { name: true } })).map(team => team.name);
      if (stateSignature(records, existingNames) !== input.signature) throw new ApiError(409, "Os participantes ou as equipes mudaram desde a prévia. Sorteie novamente.");
      if (records.some(person => !person.phaseId)) throw new ApiError(409, "Defina a fase de todos os participantes disponíveis antes de confirmar.");
      const draw = addAvailableNames(drawTeams(drawParticipants(records), input, input.seed), existingNames);
      if (!draw.analysis.feasible) throw new ApiError(400, draw.analysis.warnings.join(" "));
      const created = [];
      for (const team of draw.teams) {
        const row = await tx.team.create({ data: { eventId: input.eventId, name: team.name, minMembers: input.minSize, maxMembers: input.maxSize, members: { create: team.members.map(person => ({ participantId: person.id })) } }, include: { _count: { select: { members: true } } } });
        created.push(row);
      }
      return { teams: created, count: created.length, participants: records.length, analysis: draw.analysis };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
    return Response.json(result, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
