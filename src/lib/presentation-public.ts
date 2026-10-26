export type PublicQuestionInput = {
  position: number;
  points: number;
  revealed: boolean;
  statement: string;
  type: string;
  alternatives: unknown;
  difficulty: string;
  category: string | null;
  imageUrl: string | null;
  answer?: string | null;
  explanation?: string | null;
};

export function presentationQuestion(input: PublicQuestionInput, mode: "QUESTION" | "REVEAL", showExplanation: boolean) {
  const base = {
    position: input.position,
    points: input.points,
    statement: input.statement,
    type: input.type,
    alternatives: input.alternatives,
    difficulty: input.difficulty,
    category: input.category,
    imageUrl: input.imageUrl,
  };
  if (mode !== "REVEAL" || !input.revealed) return base;
  return { ...base, answer: input.answer, ...(showExplanation ? { explanation: input.explanation } : {}) };
}
