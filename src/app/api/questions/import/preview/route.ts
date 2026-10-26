import { analyzeQuestionImport } from "@/server/question-import";
import { ApiError } from "@/server/errors";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const eventId = body.get("eventId"), file = body.get("file");
    if (typeof eventId !== "string" || !(file instanceof File)) throw new ApiError(400, "Selecione evento e arquivo.");
    const analysis = await analyzeQuestionImport(eventId, file);
    return Response.json({ counts: analysis.counts, rows: analysis.rows.map(row => ({ line: row.line, statement: row.statement, type: row.type, category: row.category, difficulty: row.difficulty, status: row.status, issues: row.issues })) });
  } catch (error) { return errorResponse(error); }
}
