import { z } from "zod";
import { errorResponse } from "@/server/http";
import { eventSettingsInput, getEventSettings, saveEventSettings } from "@/server/event-settings";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const eventId = z.string().min(1).parse(new URL(request.url).searchParams.get("eventId")); return Response.json(await getEventSettings(eventId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try { return Response.json(await saveEventSettings(eventSettingsInput.parse(await request.json()))); }
  catch (error) { return errorResponse(error); }
}
