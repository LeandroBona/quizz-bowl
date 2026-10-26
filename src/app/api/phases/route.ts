import { prisma } from "@/server/db";
import { phaseSchema } from "@/lib/validations";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/resources";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return Response.json({ error: "Selecione um evento." }, { status: 400 });
  try { return Response.json(await prisma.coursePhase.findMany({ where: { eventId }, include: { _count: { select: { participants: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const input = phaseSchema.parse(await request.json());
    if (!await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
    return Response.json(await prisma.coursePhase.create({ data: input }), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
