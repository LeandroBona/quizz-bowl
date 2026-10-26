import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/errors";
import { questionInputSchema } from "@/lib/validations";
import { createQuestion, listQuestions } from "@/server/question-bank";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Selecione um evento.");
    return Response.json(await listQuestions(eventId, url.searchParams));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const input = questionInputSchema.parse(await request.json());
    return Response.json(await createQuestion(input), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
