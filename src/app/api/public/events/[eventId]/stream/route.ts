import { publicPresentation } from "@/server/presentation";
import { errorResponse } from "@/server/http";
import { createPresentationStream } from "@/lib/presentation-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ eventId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { eventId } = await params;
  let initialSnapshot;
  try { initialSnapshot = await publicPresentation(eventId); } catch (error) { return errorResponse(error); }
  const stream = createPresentationStream(request.signal, () => publicPresentation(eventId), 1500, initialSnapshot);
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
