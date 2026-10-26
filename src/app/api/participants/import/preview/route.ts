import { analyzeImport } from "@/server/participant-import";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/resources";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const eventId = data.get("eventId"), file = data.get("file");
    if (typeof eventId !== "string" || !(file instanceof File)) throw new ApiError(400, "Selecione um evento e um arquivo.");
    return Response.json(await analyzeImport(eventId, file));
  } catch (error) { return errorResponse(error); }
}
