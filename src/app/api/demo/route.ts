import { z } from "zod";
import { createDemo, demoActions, demoState, runDemoStep } from "@/server/demo";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const eventId = z.string().min(1).parse(new URL(request.url).searchParams.get("eventId"));
    return Response.json(await demoState(eventId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const body = z.discriminatedUnion("operation", [
      z.object({ operation: z.literal("create") }),
      z.object({ operation: z.literal("step"), eventId: z.string().min(1), action: z.enum(demoActions) }),
    ]).parse(await request.json());
    if (body.operation === "create") return Response.json(await createDemo(), { status: 201 });
    return Response.json(await runDemoStep(body.eventId, body.action));
  } catch (error) { return errorResponse(error); }
}
