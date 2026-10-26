export type DrawParticipant = { id: string; name: string; phaseId: string; phaseName: string };
export type DrawConfig = { teamCount: number; minSize: number; maxSize: number };
export type PhaseSummary = { id: string; name: string; count: number };
export type DrawAnalysis = {
  feasible: boolean;
  requestedTeamCount: number;
  effectiveTeamCount: number;
  feasibleRange: { min: number; max: number } | null;
  sizes: number[];
  phases: PhaseSummary[];
  fullDiversityPossible: boolean;
  warnings: string[];
};
export type DrawTeam = { number: number; name: string; targetSize: number; members: DrawParticipant[]; phaseCounts: Record<string, number> };
export type DrawResult = { analysis: DrawAnalysis; teams: DrawTeam[]; seed: string };

function integer(value: number) { return Number.isInteger(value) && Number.isFinite(value); }
export function analyzeDraw(participants: DrawParticipant[], config: DrawConfig): DrawAnalysis {
  const phases = [...participants.reduce((map, person) => {
    const item = map.get(person.phaseId) || { id: person.phaseId, name: person.phaseName, count: 0 };
    item.count++; map.set(person.phaseId, item); return map;
  }, new Map<string, PhaseSummary>()).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const result: DrawAnalysis = { feasible: false, requestedTeamCount: config.teamCount, effectiveTeamCount: config.teamCount, feasibleRange: null, sizes: [], phases, fullDiversityPossible: false, warnings: [] };
  if (![config.teamCount, config.minSize, config.maxSize].every(integer) || config.teamCount < 1 || config.minSize < 1 || config.maxSize < config.minSize) {
    result.warnings.push("Informe uma quantidade positiva de equipes e limites válidos de integrantes."); return result;
  }
  const total = participants.length;
  if (!total) { result.warnings.push("Não há participantes ativos e sem equipe disponíveis para o sorteio."); return result; }
  const minTeams = Math.ceil(total / config.maxSize);
  const maxTeams = Math.floor(total / config.minSize);
  if (minTeams > maxTeams) {
    result.warnings.push(`Com ${total} alunos, não é possível formar equipes entre ${config.minSize} e ${config.maxSize} integrantes. Ajuste os limites.`);
    return result;
  }
  result.feasibleRange = { min: minTeams, max: maxTeams };
  result.effectiveTeamCount = Math.max(minTeams, Math.min(config.teamCount, maxTeams));
  if (result.effectiveTeamCount !== config.teamCount) result.warnings.push(`Para ${total} alunos e os limites informados, a quantidade viável de equipes é de ${minTeams} a ${maxTeams}. A prévia usará ${result.effectiveTeamCount} equipes.`);
  const base = Math.floor(total / result.effectiveTeamCount);
  const extra = total % result.effectiveTeamCount;
  result.sizes = Array.from({ length: result.effectiveTeamCount }, (_, index) => base + (index < extra ? 1 : 0));
  const smallest = Math.min(...result.sizes);
  result.fullDiversityPossible = phases.length <= smallest && phases.every(phase => phase.count >= result.effectiveTeamCount);
  if (!result.fullDiversityPossible) {
    const scarce = phases.filter(phase => phase.count < result.effectiveTeamCount).map(phase => `${phase.name} (${phase.count})`);
    if (scarce.length) result.warnings.push(`Não há um aluno de cada fase em todas as equipes: ${scarce.join(", ")} têm menos alunos que as ${result.effectiveTeamCount} equipes. O sorteio distribuirá essas fases pelo maior número possível de equipes.`);
    if (phases.length > smallest) result.warnings.push(`Há ${phases.length} fases, mas algumas equipes terão ${smallest} vagas. A diversidade completa em todas as equipes é impossível com esses limites.`);
  }
  result.feasible = true;
  return result;
}

function seededRandom(seed: string) {
  let state = 2166136261;
  for (const char of seed) { state ^= char.charCodeAt(0); state = Math.imul(state, 16777619); }
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
function shuffle<T>(input: T[], random: () => number) {
  const items = [...input];
  for (let index = items.length - 1; index > 0; index--) { const other = Math.floor(random() * (index + 1)); [items[index], items[other]] = [items[other], items[index]]; }
  return items;
}
export function drawTeams(participants: DrawParticipant[], config: DrawConfig, seed: string): DrawResult {
  const analysis = analyzeDraw(participants, config);
  if (!analysis.feasible) return { analysis, teams: [], seed };
  const random = seededRandom(seed);
  const sizes = shuffle(analysis.sizes, random);
  const teams: DrawTeam[] = sizes.map((targetSize, index) => ({ number: index + 1, name: `Equipe ${String(index + 1).padStart(2, "0")}`, targetSize, members: [], phaseCounts: {} }));
  const tieOrder = shuffle(teams.map(team => team.number), random);
  const tie = new Map(tieOrder.map((number, index) => [number, index]));
  const buckets = analysis.phases.map(phase => ({ phase, members: shuffle(participants.filter(person => person.phaseId === phase.id), random) })).sort((a, b) => a.members.length - b.members.length || a.phase.name.localeCompare(b.phase.name, "pt-BR"));
  const add = (team: DrawTeam, person: DrawParticipant) => { team.members.push(person); team.phaseCounts[person.phaseId] = (team.phaseCounts[person.phaseId] || 0) + 1; };

  // A primeira passagem maximiza a presença de fases distintas em cada equipe.
  for (const bucket of buckets) {
    const candidates = [...teams].filter(team => team.members.length < team.targetSize).sort((a, b) =>
      a.members.length - b.members.length || a.targetSize - a.members.length - (b.targetSize - b.members.length) || (tie.get(a.number)! - tie.get(b.number)!));
    for (const team of candidates) {
      if (!bucket.members.length) break;
      if (!team.phaseCounts[bucket.phase.id]) add(team, bucket.members.shift()!);
    }
  }
  // As fases com maior sobra recebem vagas primeiro, para evitar concentração tardia.
  const remaining = [...buckets].sort((a, b) => b.members.length - a.members.length || a.phase.name.localeCompare(b.phase.name, "pt-BR"));
  for (const bucket of remaining) {
    while (bucket.members.length) {
      const team = [...teams].filter(item => item.members.length < item.targetSize).sort((a, b) =>
        (a.phaseCounts[bucket.phase.id] || 0) - (b.phaseCounts[bucket.phase.id] || 0) ||
        a.members.length / a.targetSize - b.members.length / b.targetSize ||
        (tie.get(a.number)! - tie.get(b.number)!))[0];
      if (!team) throw new Error("Falha interna: não há vaga para todos os participantes.");
      add(team, bucket.members.shift()!);
    }
  }
  return { analysis, teams, seed };
}
