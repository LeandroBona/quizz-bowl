import { z } from "zod";
import { duplicateQuestion } from "@/server/question-bank";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { eventId } = z.object({ eventId: z.string().min(1) }).parse(await request.json());
    return Response.json(await duplicateQuestion(id, eventId), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
