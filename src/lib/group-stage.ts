export const tieBreakerCodes = ["POINTS", "WINS", "DIFF", "SCORED", "HEAD_TO_HEAD", "MANUAL"] as const;
export type TieBreaker = typeof tieBreakerCodes[number];
export const defaultTieBreakers: TieBreaker[] = [...tieBreakerCodes];
export type GroupTeamInput = { id: string; name: string; manualTieRank?: number | null };
export type GroupMatchInput = { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number; officialAt?: Date | string | null; status?: string };
export type Standing = { teamId: string; name: string; position: number; played: number; wins: number; draws: number; losses: number; points: number; scored: number; conceded: number; diff: number; tiePending: boolean; qualification: "QUALIFIED" | "ELIMINATED" | "PENDING" };
export type StandingsRules = { winPoints: number; drawPoints: number; lossPoints: number; qualifiersPerGroup: number; tieBreakers: TieBreaker[] };

export function groupLabel(index: number) {
  let n = index + 1, label = "";
  while (n > 0) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}
export function validateGroupSize(teamCount: number, groupCount: number, teamsPerGroup: number | null, qualifiers: number) {
  if (teamCount < 2 || groupCount < 1 || groupCount > Math.floor(teamCount / 2)) throw new Error("É necessário ter ao menos duas equipes por grupo.");
  if (teamsPerGroup !== null && teamCount !== groupCount * teamsPerGroup) throw new Error(`São ${teamCount} equipes; ${groupCount} grupos de ${teamsPerGroup} exigem ${groupCount * teamsPerGroup}. Deixe o tamanho automático para distribuir grupos com tamanhos próximos.`);
  if (qualifiers < 1 || qualifiers > Math.floor(teamCount / groupCount)) throw new Error("A quantidade de classificados deve caber em todos os grupos.");
}
export function drawGroups<T extends { id: string }>(teams: T[], groupCount: number, teamsPerGroup: number | null, qualifiers: number, random = Math.random): T[][] {
  validateGroupSize(teams.length, groupCount, teamsPerGroup, qualifiers);
  if (new Set(teams.map(team => team.id)).size !== teams.length) throw new Error("Há equipes duplicadas no sorteio.");
  const shuffled = [...teams];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const groups = Array.from({ length: groupCount }, () => [] as T[]);
  shuffled.forEach((team, index) => groups[index % groupCount].push(team));
  return groups;
}
export function roundRobin(teamIds: string[]) {
  if (new Set(teamIds).size !== teamIds.length) throw new Error("Equipe duplicada no grupo.");
  const slots: (string | null)[] = [...teamIds];
  if (slots.length % 2) slots.push(null);
  const fixtures: { homeTeamId: string; awayTeamId: string; round: number }[] = [];
  for (let round = 0; round < slots.length - 1; round++) {
    for (let i = 0; i < slots.length / 2; i++) {
      const a = slots[i], b = slots[slots.length - 1 - i];
      if (a && b) fixtures.push({ homeTeamId: round % 2 ? b : a, awayTeamId: round % 2 ? a : b, round: round + 1 });
    }
    slots.splice(1, 0, slots.pop()!);
  }
  return fixtures;
}
export function calculateStandings(teams: GroupTeamInput[], matches: GroupMatchInput[], rules: StandingsRules): Standing[] {
  const rows = teams.map(team => ({ teamId: team.id, name: team.name, position: 0, played: 0, wins: 0, draws: 0, losses: 0, points: 0, scored: 0, conceded: 0, diff: 0, tiePending: false, qualification: "PENDING" as const }));
  const byId = new Map(rows.map(row => [row.teamId, row]));
  const official = matches.filter(match => match.officialAt && match.status !== "CANCELLED");
  for (const match of official) {
    const home = byId.get(match.homeTeamId), away = byId.get(match.awayTeamId);
    if (!home || !away) continue;
    home.played++; away.played++; home.scored += match.homeScore; home.conceded += match.awayScore; away.scored += match.awayScore; away.conceded += match.homeScore;
    if (match.homeScore === match.awayScore) { home.draws++; away.draws++; home.points += rules.drawPoints; away.points += rules.drawPoints; }
    else { const winner = match.homeScore > match.awayScore ? home : away, loser = winner === home ? away : home; winner.wins++; loser.losses++; winner.points += rules.winPoints; loser.points += rules.lossPoints; }
  }
  for (const row of rows) row.diff = row.scored - row.conceded;
  const manualRanks = new Map(teams.map(team => [team.id, team.manualTieRank]));
  function criterion(code: TieBreaker, row: typeof rows[number], tied: typeof rows): number | null {
    if (code === "POINTS") return row.points;
    if (code === "WINS") return row.wins;
    if (code === "DIFF") return row.diff;
    if (code === "SCORED") return row.scored;
    if (code === "MANUAL") { const rank = manualRanks.get(row.teamId); return rank == null ? null : -rank; }
    if (tied.length !== 2) return null;
    const direct = official.find(match => [match.homeTeamId, match.awayTeamId].includes(tied[0].teamId) && [match.homeTeamId, match.awayTeamId].includes(tied[1].teamId));
    if (!direct || direct.homeScore === direct.awayScore) return null;
    return direct.homeTeamId === row.teamId ? direct.homeScore - direct.awayScore : direct.awayScore - direct.homeScore;
  }
  function rank(bucket: typeof rows, index: number): (typeof rows)[] {
    if (bucket.length < 2 || index >= rules.tieBreakers.length) return [bucket.sort((a,b) => a.name.localeCompare(b.name, "pt-BR"))];
    const code = rules.tieBreakers[index];
    const values = bucket.map(row => criterion(code, row, bucket));
    if (values.some(value => value === null)) return rank(bucket, index + 1);
    const levels = [...new Set(values as number[])].sort((a,b) => b-a);
    return levels.flatMap(value => rank(bucket.filter((_, i) => values[i] === value), index + 1));
  }
  const buckets = rank(rows, 0);
  let position = 1;
  for (const bucket of buckets) {
    for (const row of bucket) { row.position = position; row.tiePending = bucket.length > 1; }
    position += bucket.length;
  }
  const sorted = buckets.flat();
  const complete = matches.length === teams.length * (teams.length - 1) / 2 && matches.every(match => Boolean(match.officialAt));
  const boundary = sorted[rules.qualifiersPerGroup - 1]?.position === sorted[rules.qualifiersPerGroup]?.position ? sorted[rules.qualifiersPerGroup - 1]?.position : null;
  return sorted.map((row, index) => ({ ...row, qualification: !complete || row.position === boundary ? "PENDING" : index < rules.qualifiersPerGroup ? "QUALIFIED" : "ELIMINATED" }));
}
