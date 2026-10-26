import test from "node:test";
import assert from "node:assert/strict";
import { buzzerState, validateBuzzerAward, validateBuzzerCorrection } from "./buzzer-scoring";

test("primeira campainha vale 10 ou 0; erro libera só a adversária por 5", () => {
  assert.deepEqual(buzzerState("A", "B", []).allowedPoints, [0, 10]);
  assert.throws(() => validateBuzzerAward("A", "B", [], "A", 5), /primeira resposta/i);
  const rebound = buzzerState("A", "B", [{ teamId: "A", points: 0 }]);
  assert.equal(rebound.stage, "REBOUND");
  assert.deepEqual(rebound.eligibleTeamIds, ["B"]);
  assert.deepEqual(rebound.allowedPoints, [0, 5]);
  assert.throws(() => validateBuzzerAward("A", "B", [{ teamId: "A", points: 0 }], "A", 0), /adversária/i);
  assert.throws(() => validateBuzzerAward("A", "B", [{ teamId: "A", points: 0 }], "B", 10), /segunda chance/i);
});

test("um acerto encerra a questão para ambas e correções não criam dois vencedores", () => {
  assert.equal(buzzerState("A", "B", [{ teamId: "A", points: 10 }]).stage, "DONE");
  assert.equal(buzzerState("A", "B", [{ teamId: "A", points: 0 }, { teamId: "B", points: 5 }]).stage, "DONE");
  assert.throws(() => validateBuzzerAward("A", "B", [{ teamId: "A", points: 10 }], "B", 5), /decidida/i);
  const answers = [{ id: "1", teamId: "A", points: 0 }, { id: "2", teamId: "B", points: 5 }];
  assert.throws(() => validateBuzzerCorrection(answers, "1", 10), /remova primeiro/i);
  assert.throws(() => validateBuzzerCorrection(answers, "2", 10), /segunda chance/i);
  validateBuzzerCorrection([{ ...answers[0] }, { ...answers[1], points: 0 }], "1", 10);
});
