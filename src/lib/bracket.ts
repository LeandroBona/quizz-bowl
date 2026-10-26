export type Campaign = { teamId: string; name: string; groupId: string; groupName: string; groupPosition: number; played: number; points: number; wins: number; diff: number; scored: number };
export type SeededTeam = Campaign & { seed: number };
export type PlannedSlot = { teamId: string | null; seed: number | null; sourcePosition: number | null };
export type PlannedNode = { roundIndex: number; position: number; slots: [PlannedSlot, PlannedSlot]; byeWinnerId: string | null };
export type BracketPlan = { teamCount: number; bracketSize: number; byeCount: number; matchCount: number; firstRoundMatches: number; avoidedSameGroup: number; unavoidableSameGroup: number; rounds: PlannedNode[][] };

function rate(value: number, played: number) { return value / Math.max(played, 1); }
export function campaignMetrics(team: Campaign) { return [rate(team.points, team.played), rate(team.wins, team.played), rate(team.diff, team.played), rate(team.scored, team.played), -team.groupPosition]; }
export function compareCampaigns(a: Campaign, b: Campaign) {
  const left = campaignMetrics(a), right = campaignMetrics(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
  return a.name.localeCompare(b.name, "pt-BR") || a.teamId.localeCompare(b.teamId);
}
export function campaignTie(a: Campaign, b: Campaign) { return campaignMetrics(a).every((value, i) => value === campaignMetrics(b)[i]); }
export function rankCampaigns(teams: Campaign[]) { return [...teams].sort(compareCampaigns).map((team, index) => ({ ...team, seed: index + 1 })); }
export function seedPositions(size: number): number[] {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) throw new Error("O tamanho da chave deve ser uma potência de dois.");
  let seeds = [1, 2];
  for (let current = 4; current <= size; current *= 2) seeds = seeds.flatMap(seed => [seed, current + 1 - seed]);
  return seeds;
}
export function roundName(bracketSize: number, roundIndex: number) {
  const teams = bracketSize / 2 ** roundIndex;
  if (teams === 2) return "Final";
  if (teams === 4) return "Semifinais";
  if (teams === 8) return "Quartas de final";
  if (teams === 16) return "Oitavas de final";
  return `Rodada de ${teams}`;
}
export function bracketRoundName(bracketSize: number, teamCount: number, roundIndex: number) {
  return roundIndex === 0 && teamCount < bracketSize ? "Preliminar" : roundName(bracketSize, roundIndex);
}
function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
// At most 16 first-round fixtures (32 teams), so the exact bitmask assignment is small.
function spreadGroups(pairs: [PlannedSlot, PlannedSlot][], byId: Map<string, Campaign>) {
  const indices = pairs.map((pair, index) => pair[0].teamId && pair[1].teamId ? index : -1).filter(index => index >= 0);
  if (indices.length < 2) return 0;
  const before = indices.filter(index => byId.get(pairs[index][0].teamId!)!.groupId === byId.get(pairs[index][1].teamId!)!.groupId).length;
  const movable = indices.map(index => ({ ...pairs[index][1] }));
  const memo = new Map<number, { cost: number; choice: number }>();
  const search = (mask: number): number => {
    const position = countBits(mask);
    if (position === indices.length) return 0;
    if (memo.has(mask)) return memo.get(mask)!.cost;
    let best = Infinity, choice = -1;
    for (let j = 0; j < indices.length; j++) if (!(mask & (1 << j))) {
      const fixed = byId.get(pairs[indices[position]][0].teamId!)!;
      const candidate = byId.get(movable[j].teamId!)!;
      const conflict = fixed.groupId === candidate.groupId ? 1000 : 0;
      const cost = conflict + Math.abs(position - j) + search(mask | (1 << j));
      if (cost < best) { best = cost; choice = j; }
    }
    memo.set(mask, { cost: best, choice });
    return best;
  };
  search(0);
  let mask = 0;
  for (let i = 0; i < indices.length; i++) {
    const j = memo.get(mask)!.choice;
    pairs[indices[i]][1] = movable[j];
    mask |= 1 << j;
  }
  const after = indices.filter(index => byId.get(pairs[index][0].teamId!)!.groupId === byId.get(pairs[index][1].teamId!)!.groupId).length;
  return before - after;
}
function countBits(value: number) { let count = 0; while (value) { value &= value - 1; count++; } return count; }
export function planBracket(teams: Campaign[], mode: "SEEDED" | "RANDOM", avoidSameGroup = true, random = Math.random): BracketPlan {
  if (teams.length < 2 || teams.length > 32 || new Set(teams.map(team => team.teamId)).size !== teams.length) throw new Error("A chave exige entre 2 e 32 equipes diferentes.");
  const bracketSize = 2 ** Math.ceil(Math.log2(teams.length));
  const ordered = mode === "SEEDED" ? [...teams] : shuffle(teams, random);
  const byId = new Map(teams.map(team => [team.teamId, team]));
  const seedOrder = seedPositions(bracketSize);
  const pairs: [PlannedSlot, PlannedSlot][] = [];
  for (let i = 0; i < seedOrder.length; i += 2) pairs.push([seedOrder[i], seedOrder[i + 1]].map(seed => ({ teamId: ordered[seed - 1]?.teamId ?? null, seed: seed <= teams.length ? seed : null, sourcePosition: null })) as [PlannedSlot, PlannedSlot]);
  const avoidedSameGroup = avoidSameGroup ? spreadGroups(pairs, byId) : 0;
  const first = pairs.map((slots, position) => ({ roundIndex: 0, position, slots, byeWinnerId: slots[0].teamId && !slots[1].teamId ? slots[0].teamId : slots[1].teamId && !slots[0].teamId ? slots[1].teamId : null }));
  const rounds: PlannedNode[][] = [first];
  while (rounds.at(-1)!.length > 1) {
    const previous = rounds.at(-1)!;
    rounds.push(Array.from({ length: previous.length / 2 }, (_, position) => ({ roundIndex: rounds.length, position, slots: [{ teamId: previous[position * 2].byeWinnerId, seed: null, sourcePosition: position * 2 }, { teamId: previous[position * 2 + 1].byeWinnerId, seed: null, sourcePosition: position * 2 + 1 }] as [PlannedSlot, PlannedSlot], byeWinnerId: null })));
  }
  const unavoidableSameGroup = pairs.filter(([a, b]) => a.teamId && b.teamId && byId.get(a.teamId)!.groupId === byId.get(b.teamId)!.groupId).length;
  return { teamCount: teams.length, bracketSize, byeCount: bracketSize - teams.length, matchCount: teams.length - 1, firstRoundMatches: pairs.filter(([a, b]) => a.teamId && b.teamId).length, avoidedSameGroup, unavoidableSameGroup, rounds };
}
export function winnerFromOfficial(match: { officialAt: Date | string | null; homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number }, tieRule: "SCORE" | "MANUAL", manualWinnerId?: string | null) {
  if (!match.officialAt) return null;
  if (match.homeScore !== match.awayScore) return match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
  if (tieRule === "MANUAL" && (manualWinnerId === match.homeTeamId || manualWinnerId === match.awayTeamId)) return manualWinnerId;
  return null;
}
export function dependentNodePath(sourceNodeId: string, edges: { sourceNodeId: string | null; nodeId: string }[]) {
  const next = new Map<string, string>();
  for (const edge of edges) if (edge.sourceNodeId) {
    if (next.has(edge.sourceNodeId)) throw new Error("Uma partida não pode alimentar dois confrontos seguintes.");
    next.set(edge.sourceNodeId, edge.nodeId);
  }
  const path: string[] = [], visited = new Set([sourceNodeId]);
  let current = sourceNodeId;
  while (next.has(current)) {
    current = next.get(current)!;
    if (visited.has(current)) throw new Error("O chaveamento contém um ciclo de avanços.");
    visited.add(current);
    path.push(current);
  }
  return path;
}
