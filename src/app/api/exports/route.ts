import { z } from "zod";
import { makeCsv, makePdf } from "@/lib/export-files";
import { exportDatasets, exportTable } from "@/server/exports";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { eventId, dataset, format } = z.object({ eventId: z.string().min(1), dataset: z.enum(exportDatasets), format: z.enum(["csv", "pdf"]) }).parse({ eventId: params.get("eventId"), dataset: params.get("dataset"), format: params.get("format") });
    const table = await exportTable(eventId, dataset);
    const filename = `quiz-bowl-${dataset}-${eventId.replace(/[^a-zA-Z0-9_-]/g, "")}.${format}`;
    if (format === "csv") return new Response(makeCsv(table), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(makePdf(table)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
