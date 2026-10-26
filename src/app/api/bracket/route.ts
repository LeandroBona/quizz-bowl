import { z } from "zod";
import { errorResponse } from "@/server/http";
import { ApiError } from "@/server/errors";
import { bracketConfigSchema, bracketContext, confirmBracket, homologateBracketScore, previewBracket, revokeBracketScore, saveBracketScore, swapBracketSlots } from "@/server/bracket";
export const runtime = "nodejs";
const id = z.string().min(1);
export async function GET(request: Request) {
  try { const query = new URL(request.url).searchParams; const eventId = id.parse(query.get("eventId")); const phaseId = query.get("phaseId") || undefined; return Response.json(await bracketContext(eventId, phaseId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json(), action = z.string().parse(body.action);
    if (action === "preview") return Response.json(await previewBracket(bracketConfigSchema.parse(body)));
    if (action === "confirm") { const data = bracketConfigSchema.extend({ signature: z.string().length(64), orderedIds: z.array(id) }).parse(body); return Response.json(await confirmBracket(data), { status: 201 }); }
    const eventId = id.parse(body.eventId);
    if (action === "swap") { const data = z.object({ bracketId: id, firstSlotId: id, secondSlotId: id }).parse(body); return Response.json(await swapBracketSlots(eventId, data.bracketId, data.firstSlotId, data.secondSlotId)); }
    if (action === "score") { const data = z.object({ matchId: id, homeScore: z.number().int().min(0).max(100000), awayScore: z.number().int().min(0).max(100000), invalidateDependents: z.boolean().default(false), reason: z.string().trim().max(500).optional() }).parse(body); return Response.json(await saveBracketScore(eventId, data.matchId, data.homeScore, data.awayScore, data.invalidateDependents, data.reason)); }
    if (action === "homologate") { const data = z.object({ matchId: id, manualWinnerId: id.nullish(), reason: z.string().trim().max(500).nullish() }).parse(body); return Response.json(await homologateBracketScore(eventId, data.matchId, data.manualWinnerId, data.reason)); }
    if (action === "revoke") { const data = z.object({ matchId: id, invalidateDependents: z.boolean().default(false) }).parse(body); return Response.json(await revokeBracketScore(eventId, data.matchId, data.invalidateDependents)); }
    throw new ApiError(400, "Operação inválida.");
  } catch (error) { return errorResponse(error); }
}
