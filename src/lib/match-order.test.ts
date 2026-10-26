import test from "node:test";
import assert from "node:assert/strict";
import { compareCompetitionMatches } from "./match-order";

test("confrontos seguem rodada e depois Grupo A, B, C", () => {
  const createdAt = new Date("2026-01-01T00:00:00Z");
  const rows = [
    { id: "g-r2", group: { name: "Grupo G" }, round: "Rodada 2", createdAt },
    { id: "b-r1", group: { name: "Grupo B" }, round: "Rodada 1", createdAt },
    { id: "a-r2", group: { name: "Grupo A" }, round: "Rodada 2", createdAt },
    { id: "a-r1", group: { name: "Grupo A" }, round: "Rodada 1", createdAt },
    { id: "final", group: null, round: "Final", createdAt },
  ];
  assert.deepEqual(rows.sort(compareCompetitionMatches).map(row => row.id), ["a-r1", "b-r1", "a-r2", "g-r2", "final"]);
});
