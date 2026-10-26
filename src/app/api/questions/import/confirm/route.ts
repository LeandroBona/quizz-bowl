import { importQuestions } from "@/server/question-import";
import { ApiError } from "@/server/errors";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const eventId = body.get("eventId"), file = body.get("file");
    if (typeof eventId !== "string" || !(file instanceof File)) throw new ApiError(400, "Selecione evento e arquivo.");
    return Response.json(await importQuestions(eventId, file), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
