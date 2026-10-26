import test from "node:test";
import assert from "node:assert/strict";
import { presentationQuestion } from "./presentation-public";

const source = {
  position: 2, points: 20, revealed: false, statement: "Enunciado público",
  type: "MULTIPLE_CHOICE", alternatives: ["Opção A", "Opção B"], difficulty: "MEDIUM",
  category: "Ciências", imageUrl: null, answer: "B", explanation: "Explicação reservada",
};

test("pergunta pública não serializa gabarito nem explicação antes da revelação", () => {
  for (const mode of ["QUESTION", "REVEAL"] as const) {
    const payload = presentationQuestion(source, mode, true);
    assert.equal(JSON.stringify(payload).includes("Explicação reservada"), false);
    assert.equal(Object.hasOwn(payload, "answer"), false);
    assert.equal(Object.hasOwn(payload, "explanation"), false);
  }
});

test("revelação autorizada mostra resposta; explicação depende da configuração", () => {
  const revealed = { ...source, revealed: true };
  const hidden = presentationQuestion(revealed, "QUESTION", true);
  assert.equal(Object.hasOwn(hidden, "answer"), false);
  const withoutExplanation = presentationQuestion(revealed, "REVEAL", false);
  assert.equal("answer" in withoutExplanation && withoutExplanation.answer, "B");
  assert.equal(Object.hasOwn(withoutExplanation, "explanation"), false);
  const full = presentationQuestion(revealed, "REVEAL", true);
  assert.equal("explanation" in full && full.explanation, "Explicação reservada");
});
