import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { phaseState } from "@/server/group-stage";
import { bracketRoundName } from "@/lib/bracket";
import { compareCompetitionMatches } from "@/lib/match-order";
import type { ExportTable } from "@/lib/export-files";

export const exportDatasets = ["participants", "teams", "groups", "standings", "matches", "bracket"] as const;
export type ExportDataset = typeof exportDatasets[number];
const result = (value: number, official: Date | null) => official ? String(value) : "Pendente";

export async function exportTable(eventId: string, dataset: ExportDataset): Promise<ExportTable> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } });
  if (!event) throw new ApiError(404, "Evento não encontrado.");
  const title = `${event.name} · ${dataset}`;
  if (dataset === "participants") {
    const rows = await prisma.participant.findMany({ where: { eventId }, include: { phase: { select: { name: true } }, membership: { include: { team: { select: { name: true } } } } }, orderBy: [{ name: "asc" }] });
    return { title, columns: ["ID", "Nome", "Fase", "Turma", "Situação", "Equipe"], rows: rows.map(person => [person.id, person.name, person.phase?.name ?? "", person.className ?? "", person.participationStatus, person.membership?.team.name ?? ""]) };
  }
  if (dataset === "teams") {
    const rows = await prisma.team.findMany({ where: { eventId }, include: { members: { include: { participant: { include: { phase: true } } } } }, orderBy: { name: "asc" } });
    return { title, columns: ["Equipe", "Integrante", "Fase", "Turma"], rows: rows.flatMap(team => team.members.length ? team.members.map(member => [team.name, member.participant.name, member.participant.phase?.name ?? "", member.participant.className ?? ""]) : [[team.name, "", "", ""]]) };
  }
  if (dataset === "groups") {
    const rows = await prisma.group.findMany({ where: { eventId }, include: { phase: { select: { name: true } }, teams: { include: { team: { select: { name: true } } } } }, orderBy: [{ name: "asc" }] });
    return { title, columns: ["Fase", "Grupo", "Equipe"], rows: rows.flatMap(group => group.teams.length ? group.teams.map(member => [group.phase?.name ?? group.stage ?? "", group.name, member.team.name]) : [[group.phase?.name ?? group.stage ?? "", group.name, ""]]) };
  }
  if (dataset === "standings") {
    const phases = await prisma.groupPhase.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
    const states = await Promise.all(phases.map(phase => phaseState(eventId, phase.id)));
    return { title, columns: ["Fase", "Grupo", "Posição", "Equipe", "J", "V", "E", "D", "Pontos", "Marcados", "Sofridos", "Saldo", "Situação"], rows: states.flatMap(state => state.groups.flatMap(group => group.standings.map(row => [state.phase.name, group.name, row.position, row.name, row.played, row.wins, row.draws, row.losses, row.points, row.scored, row.conceded, row.diff, row.qualification]))) };
  }
  if (dataset === "matches") {
    const rows = (await prisma.match.findMany({ where: { eventId }, include: { group: { select: { name: true } }, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } })).sort(compareCompetitionMatches);
    return { title, columns: ["ID", "Etapa", "Rodada", "Equipe A", "Pontos A", "Equipe B", "Pontos B", "Situação", "Homologada em"], rows: rows.map(match => [match.id, match.group?.name ?? "Mata-mata", match.round ?? "", match.homeTeam.name, result(match.homeScore, match.officialAt), match.awayTeam.name, result(match.awayScore, match.officialAt), match.status, match.officialAt?.toISOString() ?? ""]) };
  }
  const bracket = await prisma.bracket.findFirst({ where: { eventId }, include: { nodes: { include: { slots: { include: { team: { select: { name: true } } }, orderBy: { side: "asc" } }, winnerTeam: { select: { name: true } }, match: true }, orderBy: [{ roundIndex: "asc" }, { position: "asc" }] } }, orderBy: { createdAt: "desc" } });
  return { title, columns: ["Rodada", "Confronto", "Equipe A", "Equipe B", "Vencedora", "Situação"], rows: bracket?.nodes.map(node => [bracketRoundName(bracket.bracketSize, bracket.teamCount, node.roundIndex), node.position + 1, node.slots[0]?.team?.name ?? "A definir", node.slots[1]?.team?.name ?? "A definir", node.winnerTeam?.name ?? "", node.match?.officialAt ? "Homologado" : node.winnerTeamId ? "Vaga direta" : "Pendente"]) ?? [] };
}
