import assert from "node:assert/strict";
import test from "node:test";
import { selectBalancedQuestions, type SelectableQuestion } from "./question-selection";
import { publicQuestion } from "./question-public";

const pool: SelectableQuestion[] = ["EASY", "MEDIUM", "HARD"].flatMap(difficulty => Array.from({ length: 8 }, (_, index) => ({ id: `${difficulty}-${index}`, difficulty: difficulty as SelectableQuestion["difficulty"] })));

test("sorteio não repete questões e equilibra os níveis disponíveis", () => {
  const result = selectBalancedQuestions(pool, 15, "seed-1");
  assert.equal(new Set(result.map(item => item.id)).size, 15);
  assert.deepEqual(["EASY", "MEDIUM", "HARD"].map(level => result.filter(item => item.difficulty === level).length), [5, 5, 5]);
});

test("questões já utilizadas são excluídas do novo sorteio", () => {
  const first = selectBalancedQuestions(pool, 10, "seed-2");
  const used = new Set(first.map(item => item.id));
  const next = selectBalancedQuestions(pool, 10, "seed-3", used);
  assert.equal(next.some(item => used.has(item.id)), false);
  assert.throws(() => selectBalancedQuestions(pool, 15, "seed-4", used), /somente 14/);
});

test("a API pública omite resposta e explicação antes da revelação", () => {
  const source = { id: "usage-1", position: 1, awardedPoints: 20, status: "ASSIGNED" as const, question: { id: "question-1", statement: "Quanto é dois mais dois?", type: "SHORT_ANSWER", alternatives: null, answer: "4", explanation: "Soma simples", category: "Matemática", difficulty: "EASY", timeSeconds: 30, imageUrl: null } };
  const hidden = publicQuestion(source);
  assert.equal(JSON.stringify(hidden).includes('"answer"'), false);
  assert.equal(JSON.stringify(hidden).includes('"explanation"'), false);
  const revealed = publicQuestion({ ...source, status: "REVEALED" });
  assert.equal(revealed.question.answer, "4");
});
