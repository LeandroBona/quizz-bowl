import test from "node:test";
import assert from "node:assert/strict";
import { buzzerState, orderBuzzerAnswers, validateBuzzerAward, validateBuzzerCorrection } from "./buzzer-scoring";

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

test("mata-mata: segunda chance de 15 e tréplica de 20 para a primeira equipe", () => {
  const first = [{ teamId: "A", points: 0 }];
  assert.deepEqual(buzzerState("A", "B", first, "KNOCKOUT").allowedPoints, [0, 15]);
  assert.throws(() => validateBuzzerAward("A", "B", first, "B", 5, "KNOCKOUT"), /segunda chance/i);
  const second = [...first, { teamId: "B", points: 0 }];
  assert.deepEqual(buzzerState("A", "B", second, "KNOCKOUT"), { stage: "REPLY", eligibleTeamIds: ["A"], allowedPoints: [0, 20] });
  validateBuzzerAward("A", "B", second, "A", 20, "KNOCKOUT");
  assert.equal(buzzerState("A", "B", [...second, { teamId: "A", points: 20 }], "KNOCKOUT").stage, "DONE");
  assert.equal(buzzerState("A", "B", [{ teamId: "A", points: 0 }, { teamId: "B", points: 15 }], "KNOCKOUT").stage, "DONE");
  assert.equal(buzzerState("A", "B", [...second, { teamId: "A", points: 0 }], "KNOCKOUT").stage, "DONE");
  assert.throws(() => validateBuzzerCorrection([{ id: "1", ...first[0] }, { id: "2", teamId: "B", points: 15 }], "1", 10, "KNOCKOUT"), /remova primeiro/i);
  assert.throws(() => validateBuzzerCorrection([{ id: "1", ...first[0] }, { id: "2", teamId: "B", points: 0 }, { id: "3", teamId: "A", points: 20 }], "2", 15, "KNOCKOUT"), /remova primeiro/i);
});

test("ordem da campainha usa o estágio persistido mesmo com horários iguais", () => {
  const time = "2026-10-26T10:00:00.000Z";
  const answers = [{ id: "a-segunda", createdAt: time, teamId: "B", points: 5 }, { id: "z-primeira", createdAt: time, teamId: "A", points: 0 }];
  const ordered = orderBuzzerAnswers(answers, [
    { details: { answerId: "z-primeira", buzzerStage: "FIRST" } },
    { details: { answerId: "a-segunda", buzzerStage: "REBOUND" } },
  ]);
  assert.deepEqual(ordered.map(answer => answer.id), ["z-primeira", "a-segunda"]);
  assert.doesNotThrow(() => validateBuzzerCorrection(ordered, "a-segunda", 5));
  assert.throws(() => validateBuzzerCorrection(ordered, "z-primeira", 10), /remova primeiro/i);
  const history = orderBuzzerAnswers([
    { id: "q2-primeira", assignmentId: "q2", createdAt: "2026-10-26T10:00:01.000Z" },
    { id: "q1-segunda", assignmentId: "q1", createdAt: time },
  ], [
    { details: { answerId: "q2-primeira", buzzerStage: "FIRST" } },
    { details: { answerId: "q1-segunda", buzzerStage: "REBOUND" } },
  ]);
  assert.deepEqual(history.map(answer => answer.id), ["q1-segunda", "q2-primeira"]);
  const reply = orderBuzzerAnswers([
    { id: "a-terceira", assignmentId: "q1", createdAt: time },
    { id: "z-primeira", assignmentId: "q1", createdAt: time },
    { id: "m-segunda", assignmentId: "q1", createdAt: time },
  ], [
    { details: { answerId: "z-primeira", buzzerStage: "FIRST" } },
    { details: { answerId: "m-segunda", buzzerStage: "REBOUND" } },
    { details: { answerId: "a-terceira", buzzerStage: "REPLY" } },
  ]);
  assert.deepEqual(reply.map(answer => answer.id), ["z-primeira", "m-segunda", "a-terceira"]);
});
