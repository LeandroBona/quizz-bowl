export type BuzzerAnswer = { teamId: string; points: number };
export type BuzzerPoints = 0 | 5 | 10;

export function orderBuzzerAnswers<T extends { id: string; createdAt: Date | string; assignmentId?: string | null }>(answers: T[], events: { details: unknown }[]): T[] {
  const stage = new Map<string, number>();
  for (const event of events) {
    if (!event.details || typeof event.details !== "object" || Array.isArray(event.details)) continue;
    const details = event.details as { answerId?: unknown; buzzerStage?: unknown };
    if (typeof details.answerId === "string") {
      if (details.buzzerStage === "FIRST") stage.set(details.answerId, 0);
      if (details.buzzerStage === "REBOUND") stage.set(details.answerId, 1);
    }
  }
  return [...answers].sort((a, b) => {
    const first = stage.get(a.id), second = stage.get(b.id);
    if (a.assignmentId === b.assignmentId && first !== undefined && second !== undefined && first !== second) return first - second;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
  });
}

export function buzzerState(homeTeamId: string, awayTeamId: string, answers: BuzzerAnswer[]) {
  if (answers.length === 0) return { stage: "FIRST" as const, eligibleTeamIds: [homeTeamId, awayTeamId], allowedPoints: [0, 10] as const };
  if (answers.length === 1 && answers[0].points <= 0) {
    const otherTeamId = answers[0].teamId === homeTeamId ? awayTeamId : homeTeamId;
    return { stage: "REBOUND" as const, eligibleTeamIds: [otherTeamId], allowedPoints: [0, 5] as const };
  }
  return { stage: "DONE" as const, eligibleTeamIds: [] as string[], allowedPoints: [] as BuzzerPoints[] };
}

export function validateBuzzerAward(homeTeamId: string, awayTeamId: string, answers: BuzzerAnswer[], teamId: string, points: BuzzerPoints) {
  const state = buzzerState(homeTeamId, awayTeamId, answers);
  if (state.stage === "DONE") throw new Error("Esta questão já foi decidida. Avance para a próxima.");
  if (!state.eligibleTeamIds.includes(teamId)) throw new Error(state.stage === "REBOUND" ? "Somente a equipe adversária pode responder agora." : "Equipe não participa desta partida.");
  if (!(state.allowedPoints as readonly number[]).includes(points)) throw new Error(state.stage === "FIRST" ? "A primeira resposta vale 10 pontos se correta ou 0 se errada." : "A segunda chance vale 5 pontos se correta ou 0 se errada.");
  return state;
}

export function validateBuzzerCorrection(answers: (BuzzerAnswer & { id: string })[], answerId: string, points: BuzzerPoints) {
  const index = answers.findIndex(answer => answer.id === answerId);
  if (index < 0) throw new Error("Resposta não encontrada nesta questão.");
  if (index === 0) {
    if (points === 5) throw new Error("A primeira resposta só pode valer 0 ou 10 pontos.");
    if (points === 10 && answers.slice(1).some(answer => answer.points > 0)) throw new Error("Remova primeiro os pontos da segunda equipe antes de corrigir a primeira para 10.");
  } else {
    if (points === 10) throw new Error("A segunda chance só pode valer 0 ou 5 pontos.");
    if (points === 5 && answers[0].points > 0) throw new Error("A primeira equipe já pontuou nesta questão.");
  }
}
