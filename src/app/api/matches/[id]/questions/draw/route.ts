import { questionDrawSchema } from "@/lib/validations";
import { drawMatchQuestions } from "@/server/match-questions";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const input = questionDrawSchema.parse(await request.json());
    return Response.json(await drawMatchQuestions(id, input), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
