import { prisma } from "@/server/db";
import { phaseSchema } from "@/lib/validations";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/resources";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const input = phaseSchema.parse(await request.json());
    if (!await prisma.coursePhase.findFirst({ where: { id, eventId: input.eventId }, select: { id: true } })) throw new ApiError(404, "Fase não encontrada neste evento.");
    return Response.json(await prisma.coursePhase.update({ where: { id }, data: { name: input.name, sortOrder: input.sortOrder } }));
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  const eventId = new URL(request.url).searchParams.get("eventId");
  try {
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    const phase = await prisma.coursePhase.findFirst({ where: { id, eventId }, include: { _count: { select: { participants: true } } } });
    if (!phase) throw new ApiError(404, "Fase não encontrada neste evento.");
    if (phase._count.participants) throw new ApiError(409, "Esta fase possui participantes. Mova-os antes de excluí-la.");
    await prisma.coursePhase.delete({ where: { id } }); return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
