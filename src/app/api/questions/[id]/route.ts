import { prisma } from "@/server/db";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/errors";
import { questionInputSchema } from "@/lib/validations";
import { deleteQuestion, updateQuestion } from "@/server/question-bank";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    const row = await prisma.question.findFirst({ where: { id, OR: [{ eventId }, { eventId: null }] } });
    if (!row) throw new ApiError(404, "Questão não encontrada.");
    return Response.json(row);
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return Response.json(await updateQuestion(id, questionInputSchema.parse(await request.json())));
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    await deleteQuestion(id, eventId);
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
