import { buildDrawPreview } from "@/server/team-draw";
import { errorResponse } from "@/server/http";
import { drawConfigSchema } from "@/lib/validations";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const input = drawConfigSchema.parse(await request.json()); return Response.json(await buildDrawPreview(input.eventId, input)); }
  catch (error) { return errorResponse(error); }
}
