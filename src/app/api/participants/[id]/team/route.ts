import { prisma } from "@/server/db";
import { teamAssignmentSchema } from "@/lib/validations";
import { errorResponse } from "@/server/http";
import { changeMembership } from "@/server/membership";
import { Prisma } from "@prisma/client";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const input = teamAssignmentSchema.parse(await request.json());
    return Response.json(await prisma.$transaction(async tx => {
      await changeMembership(tx, id, input.eventId, input.teamId);
      return tx.participant.findUniqueOrThrow({ where: { id }, include: { membership: { include: { team: true } }, phase: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (error) { return errorResponse(error); }
}
