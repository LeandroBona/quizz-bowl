import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/resources";
import { drawTeams, type DrawConfig, type DrawParticipant, type DrawResult } from "@/lib/team-draw";
import { normalizeIdentity } from "@/lib/participant-key";

type PoolRecord = { id: string; name: string; phaseId: string | null; updatedAt: Date; phase: { name: string } | null };
export function stateSignature(records: PoolRecord[], existingNames: string[]) {
  const state = { participants: records.map(person => [person.id, person.name, person.phaseId, person.updatedAt.toISOString()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), teams: [...existingNames].sort() };
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
export function drawParticipants(records: PoolRecord[]): DrawParticipant[] {
  return records.filter(person => person.phaseId && person.phase).map(person => ({ id: person.id, name: person.name, phaseId: person.phaseId!, phaseName: person.phase!.name }));
}
export function addAvailableNames(result: DrawResult, existingNames: string[]) {
  const used = new Set(existingNames.map(normalizeIdentity));
  let number = 1;
  for (const team of result.teams) {
    let name = "";
    do { name = `Equipe ${String(number++).padStart(2, "0")}`; } while (used.has(normalizeIdentity(name)));
    used.add(normalizeIdentity(name)); team.name = name;
  }
  return result;
}
export async function loadDrawState(eventId: string) {
  if (!await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
  const [records, teams] = await Promise.all([
    prisma.participant.findMany({ where: { eventId, participationStatus: "ACTIVE", membership: { is: null } }, select: { id: true, name: true, phaseId: true, updatedAt: true, phase: { select: { name: true } } }, orderBy: { id: "asc" } }),
    prisma.team.findMany({ where: { eventId }, select: { name: true } })
  ]);
  const existingNames = teams.map(team => team.name);
  const settings = await prisma.eventSettings.findUnique({ where: { eventId }, select: { teamCount: true, minMembers: true, maxMembers: true } });
  return { records, participants: drawParticipants(records), missingPhase: records.filter(person => !person.phaseId).length, existingNames, signature: stateSignature(records, existingNames), defaults: settings };
}
export async function buildDrawPreview(eventId: string, config: DrawConfig, seed = randomUUID()) {
  const state = await loadDrawState(eventId);
  if (state.missingPhase) throw new ApiError(409, `${state.missingPhase} participante(s) ativo(s) e sem equipe ainda não têm fase. Defina a fase antes de sortear.`);
  return { ...addAvailableNames(drawTeams(state.participants, config, seed), state.existingNames), signature: state.signature };
}
