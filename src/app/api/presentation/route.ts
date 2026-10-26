import { z } from "zod";
import { errorResponse } from "@/server/http";
import { presentationControl, presentationInput, updatePresentation } from "@/server/presentation";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const eventId = z.string().min(1).parse(new URL(request.url).searchParams.get("eventId")); return Response.json(await presentationControl(eventId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await updatePresentation(presentationInput.parse(await request.json()))); }
  catch (error) { return errorResponse(error); }
}
