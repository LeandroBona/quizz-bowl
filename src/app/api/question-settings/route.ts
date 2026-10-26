import { prisma } from "@/server/db";
import { assertEvent } from "@/server/question-bank";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/errors";
import { questionSettingsSchema } from "@/lib/validations";
export const runtime = "nodejs";
const defaults = { pointsMode: "BY_DIFFICULTY", easyPoints: 10, mediumPoints: 20, hardPoints: 30, fixedPoints: 10, noRepeat: true };
export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    await assertEvent(eventId);
    return Response.json(await prisma.questionSettings.findUnique({ where: { eventId } }) || { eventId, ...defaults });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const input = questionSettingsSchema.parse(await request.json());
    await assertEvent(input.eventId);
    return Response.json(await prisma.questionSettings.upsert({ where: { eventId: input.eventId }, create: input, update: input }));
  } catch (error) { return errorResponse(error); }
}
