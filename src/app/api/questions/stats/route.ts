import { prisma } from "@/server/db";
import { assertEvent } from "@/server/question-bank";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    await assertEvent(eventId);
    const [available, used, reserved, settings] = await Promise.all([
      prisma.question.count({ where: { isActive: true, OR: [{ eventId }, { eventId: null }] } }),
      prisma.questionUse.findMany({ where: { eventId }, select: { questionId: true }, distinct: ["questionId"] }),
      prisma.eventQuestionReservation.findMany({ where: { eventId }, select: { questionId: true } }),
      prisma.questionSettings.findUnique({ where: { eventId }, select: { noRepeat: true } })
    ]);
    const remaining = await prisma.question.count({ where: { isActive: true, OR: [{ eventId }, { eventId: null }], uses: { none: { eventId } }, reservations: { none: { eventId } } } });
    return Response.json({ available, used: new Set([...used.map(item => item.questionId), ...reserved.map(item => item.questionId)]).size, remaining, noRepeat: settings?.noRepeat ?? true });
  } catch (error) { return errorResponse(error); }
}
