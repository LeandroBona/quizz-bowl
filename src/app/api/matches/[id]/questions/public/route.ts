import { listMatchQuestions } from "@/server/match-questions";
import { ApiError } from "@/server/errors";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    return Response.json(await listMatchQuestions(id, eventId, true), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
