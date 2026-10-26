import { errorResponse } from "@/server/http";
import { publicPresentation } from "@/server/presentation";

export const runtime = "nodejs";
type Context = { params: Promise<{ eventId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const { eventId } = await params; return Response.json(await publicPresentation(eventId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
