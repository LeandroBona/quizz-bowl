import { loadDrawState } from "@/server/team-draw";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return Response.json({ error: "Selecione um evento." }, { status: 400 });
  try {
    const state = await loadDrawState(eventId);
    const phases = [...state.participants.reduce((map, person) => { const phase = map.get(person.phaseId) || { id: person.phaseId, name: person.phaseName, count: 0 }; phase.count++; map.set(person.phaseId, phase); return map; }, new Map<string, { id: string; name: string; count: number }>()).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return Response.json({ participants: state.participants, phases, missingPhase: state.missingPhase, existingTeamCount: state.existingNames.length, defaults: state.defaults });
  } catch (error) { return errorResponse(error); }
}
