export type PublicQuestionSource = {
  id: string;
  position: number;
  awardedPoints: number;
  status: "ASSIGNED" | "REVEALED";
  question: { id: string; statement: string; type: string; alternatives: unknown; answer: string; explanation: string | null; category: string | null; difficulty: string; timeSeconds: number; imageUrl: string | null };
};

export function publicQuestion(source: PublicQuestionSource) {
  const { question } = source;
  return {
    id: source.id,
    position: source.position,
    points: 10,
    revealed: source.status === "REVEALED",
    question: {
      id: question.id,
      statement: question.statement,
      type: question.type,
      alternatives: question.alternatives,
      category: question.category,
      difficulty: question.difficulty,
      timeSeconds: question.timeSeconds,
      imageUrl: question.imageUrl,
      ...(source.status === "REVEALED" ? { answer: question.answer, explanation: question.explanation } : {})
    }
  };
}
