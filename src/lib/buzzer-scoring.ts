export type BuzzerAnswer = { teamId: string; points: number };
export type BuzzerPoints = 0 | 5 | 10 | 15 | 20;
export type BuzzerFormat = "GROUP" | "KNOCKOUT";

export function orderBuzzerAnswers<T extends { id: string; createdAt: Date | string; assignmentId?: string | null }>(answers: T[], events: { details: unknown }[]): T[] {
  const stage = new Map<string, number>();
  for (const event of events) {
    if (!event.details || typeof event.details !== "object" || Array.isArray(event.details)) continue;
    const details = event.details as { answerId?: unknown; buzzerStage?: unknown };
    if (typeof details.answerId === "string") {
      if (details.buzzerStage === "FIRST") stage.set(details.answerId, 0);
      if (details.buzzerStage === "REBOUND") stage.set(details.answerId, 1);
      if (details.buzzerStage === "REPLY") stage.set(details.answerId, 2);
    }
  }
  return [...answers].sort((a, b) => {
    const first = stage.get(a.id), second = stage.get(b.id);
    if (a.assignmentId === b.assignmentId && first !== undefined && second !== undefined && first !== second) return first - second;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
  });
}

export function buzzerState(homeTeamId: string, awayTeamId: string, answers: BuzzerAnswer[], format: BuzzerFormat = "GROUP") {
  if (answers.length === 0) return { stage: "FIRST" as const, eligibleTeamIds: [homeTeamId, awayTeamId], allowedPoints: [0, 10] as readonly BuzzerPoints[] };
  if (answers.some(answer => answer.points > 0)) return { stage: "DONE" as const, eligibleTeamIds: [] as string[], allowedPoints: [] as readonly BuzzerPoints[] };
  if (answers.length === 1) {
    const otherTeamId = answers[0].teamId === homeTeamId ? awayTeamId : homeTeamId;
    return { stage: "REBOUND" as const, eligibleTeamIds: [otherTeamId], allowedPoints: [0, format === "KNOCKOUT" ? 15 : 5] as readonly BuzzerPoints[] };
  }
  if (answers.length === 2 && format === "KNOCKOUT") return { stage: "REPLY" as const, eligibleTeamIds: [answers[0].teamId], allowedPoints: [0, 20] as readonly BuzzerPoints[] };
  return { stage: "DONE" as const, eligibleTeamIds: [] as string[], allowedPoints: [] as readonly BuzzerPoints[] };
}

export function validateBuzzerAward(homeTeamId: string, awayTeamId: string, answers: BuzzerAnswer[], teamId: string, points: BuzzerPoints, format: BuzzerFormat = "GROUP") {
  const state = buzzerState(homeTeamId, awayTeamId, answers, format);
  if (state.stage === "DONE") throw new Error("Esta questão já foi decidida. Avance para a próxima.");
  if (!state.eligibleTeamIds.includes(teamId)) throw new Error(state.stage === "FIRST" ? "Equipe não participa desta partida." : "Somente a equipe adversária ou a equipe com direito à próxima tentativa pode responder agora.");
  if (!state.allowedPoints.includes(points)) throw new Error(`${state.stage === "FIRST" ? "A primeira resposta" : state.stage === "REBOUND" ? "A segunda chance" : "A tréplica"} vale ${state.allowedPoints.filter(value => value > 0).join(" ou ")} pontos se correta ou 0 se errada.`);
  return state;
}

export function validateBuzzerCorrection(answers: (BuzzerAnswer & { id: string })[], answerId: string, points: BuzzerPoints, format: BuzzerFormat = "GROUP") {
  const index = answers.findIndex(answer => answer.id === answerId);
  if (index < 0) throw new Error("Resposta não encontrada nesta questão.");
  const allowed = index === 0 ? 10 : index === 1 ? format === "KNOCKOUT" ? 15 : 5 : index === 2 && format === "KNOCKOUT" ? 20 : -1;
  if (points !== 0 && points !== allowed) throw new Error(`${index === 0 ? "A primeira resposta" : index === 1 ? "A segunda chance" : "A tréplica"} só pode valer 0 ou ${allowed} pontos.`);
  if (points > 0 && answers.some((answer, i) => i !== index && answer.points > 0)) throw new Error("Remova primeiro os pontos da outra tentativa antes de atribuir este acerto.");
}
