import { z } from "zod";
import { revealMatchQuestion } from "@/server/match-questions";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; assignmentId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { id, assignmentId } = await context.params;
    const { eventId } = z.object({ eventId: z.string().min(1) }).parse(await request.json());
    return Response.json(await revealMatchQuestion(id, assignmentId, eventId));
  } catch (error) { return errorResponse(error); }
}
