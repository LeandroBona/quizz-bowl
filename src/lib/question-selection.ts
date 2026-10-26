export type SelectableQuestion = { id: string; difficulty: "EASY" | "MEDIUM" | "HARD" };

function seededRandom(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function selectBalancedQuestions<T extends SelectableQuestion>(pool: T[], count: number, seed: string, excludedIds: ReadonlySet<string> = new Set()): T[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Quantidade inválida de questões.");
  const unique = [...new Map(pool.filter(question => !excludedIds.has(question.id)).map(question => [question.id, question])).values()];
  if (unique.length < count) throw new Error(`Há somente ${unique.length} questão(ões) disponível(is) para ${count} solicitada(s).`);
  const random = seededRandom(seed);
  const levels: SelectableQuestion["difficulty"][] = ["EASY", "MEDIUM", "HARD"];
  const buckets = Object.fromEntries(levels.map(level => [level, shuffle(unique.filter(question => question.difficulty === level), random)])) as Record<SelectableQuestion["difficulty"], T[]>;
  const selected: T[] = [];
  const picked = { EASY: 0, MEDIUM: 0, HARD: 0 };
  while (selected.length < count) {
    const candidates = levels.filter(level => buckets[level].length);
    if (!candidates.length) throw new Error("Não há questões suficientes para concluir o sorteio.");
    const fewest = Math.min(...candidates.map(level => picked[level]));
    const tied = candidates.filter(level => picked[level] === fewest);
    const level = tied[Math.floor(random() * tied.length)];
    selected.push(buckets[level].pop()!);
    picked[level]++;
  }
  return selected;
}
