import { prisma } from "@/server/db";
import { errorResponse } from "@/server/http";
import { phaseState } from "@/server/group-stage";
import { compareCompetitionMatches } from "@/lib/match-order";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return Response.json({ error: "Selecione um evento." }, { status: 400 });
  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return Response.json({ error: "Evento não encontrado." }, { status: 404 });
    const [participants, teams, questions, groups, finished, pending, nextMatches, matches, qualified] = await Promise.all([
      prisma.participant.count({ where: { eventId } }), prisma.team.count({ where: { eventId } }),
      prisma.question.count({ where: { eventId } }), prisma.group.count({ where: { eventId } }),
      prisma.match.count({ where: { eventId, status: "FINISHED" } }),
      prisma.match.count({ where: { eventId, status: { in: ["SCHEDULED", "LIVE"] } } }),
      prisma.match.findMany({ where: { eventId, status: { in: ["SCHEDULED", "LIVE"] } }, include: { homeTeam: true, awayTeam: true, group: true } }),
      prisma.match.findMany({ where: { eventId, status: "FINISHED" }, select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true } }),
      prisma.team.findMany({ where: { eventId }, select: { id: true, name: true, color: true } })
    ]);
    let standings = qualified.map(team => {
      const played = matches.filter(m => m.homeTeamId === team.id || m.awayTeamId === team.id);
      const wins = played.filter(m => m.homeTeamId === team.id ? m.homeScore > m.awayScore : m.awayScore > m.homeScore).length;
      const points = played.reduce((sum, m) => sum + (m.homeTeamId === team.id ? m.homeScore : m.awayScore), 0);
      return { ...team, played: played.length, wins, points };
    }).sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name)).slice(0, 5);
    const activePhase = await prisma.groupPhase.findFirst({ where: { eventId, confirmedAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    let qualifiedCount = 0;
    if (activePhase) {
      const state = await phaseState(eventId, activePhase.id);
      const byId = new Map(qualified.map(team => [team.id, team]));
      const classified = state.groups.flatMap(group => group.standings.filter(row => row.qualification === "QUALIFIED"));
      qualifiedCount = classified.length;
      standings = classified.map(row => ({ id: row.teamId, name: row.name, color: byId.get(row.teamId)?.color || null, played: row.played, wins: row.wins, points: row.points })).sort((a,b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, 5);
    }
    return Response.json({ event, counts: { participants, teams, questions, groups, finished, pending }, nextMatches: nextMatches.sort(compareCompetitionMatches).slice(0, 5), standings, hasGroupPhase: Boolean(activePhase), qualifiedCount });
  } catch (error) { return errorResponse(error); }
}
