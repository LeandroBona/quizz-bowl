import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
const schema = z.object({ eventId: z.string().min(1), firstId: z.string().min(1), secondId: z.string().min(1) }).refine(value => value.firstId !== value.secondId, { message: "Escolha dois participantes diferentes." });
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await prisma.$transaction(async tx => {
      const people = await tx.participant.findMany({ where: { eventId: input.eventId, id: { in: [input.firstId, input.secondId] } }, include: { membership: true } });
      if (people.length !== 2 || people.some(person => person.participationStatus !== "ACTIVE")) throw new ApiError(409, "Os dois participantes devem estar ativos e pertencer a este evento.");
      const first = people.find(person => person.id === input.firstId)!;
      const second = people.find(person => person.id === input.secondId)!;
      if (!first.membership) throw new ApiError(409, "O primeiro participante precisa estar em uma equipe.");
      if (first.membership.teamId === second.membership?.teamId) throw new ApiError(400, "Selecione um integrante de outra equipe ou um aluno sem equipe.");
      if (second.membership) {
        await tx.teamMember.update({ where: { participantId: first.id }, data: { teamId: second.membership.teamId } });
        await tx.teamMember.update({ where: { participantId: second.id }, data: { teamId: first.membership.teamId } });
      } else {
        await tx.teamMember.update({ where: { participantId: first.id }, data: { participantId: second.id } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ success: true });
  } catch (error) { return errorResponse(error); }
}
