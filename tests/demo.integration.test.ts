import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { createDemo, demoActions, demoState, runDemoStep } from "../src/server/demo";
import { exportTable } from "../src/server/exports";
import { deleteRecord } from "../src/server/resources";

test("demonstração percorre o campeonato completo sem modificar um evento real", async () => {
  const real = await prisma.event.create({ data: { name: "Evento real preservado" } });
  const demo = await createDemo();
  try {
    for (let index = 0; index < demoActions.length; index++) {
      const state = await runDemoStep(demo.id, demoActions[index]);
      assert.equal(state.stage, index + 1);
      if (index === 2 || index === 3) assert.equal(state.matches, 21);
    }
    const state = await demoState(demo.id);
    assert.equal(state.isDemo, true); assert.equal(state.participants, 117); assert.equal(state.teams, 21); assert.equal(state.groups, 7); assert.equal(state.matches, 34); assert.equal(state.officialMatches, 34); assert.equal(state.qualified, 14); assert.equal(state.bracketMatches, 13); assert.ok(state.championTeamId);
    const teams = await prisma.team.findMany({ where: { eventId: demo.id }, include: { members: { include: { participant: true } } } });
    assert.equal(teams.filter(team => team.members.length === 5).length, 9);
    assert.equal(teams.filter(team => team.members.length === 6).length, 12);
    assert.ok(teams.every(team => new Set(team.members.map(member => member.participant.phaseId)).size === 4));
    for (const dataset of ["participants", "teams", "groups", "standings", "matches", "bracket"] as const) assert.ok((await exportTable(demo.id, dataset)).rows.length > 0);
    assert.equal(await prisma.participant.count({ where: { eventId: real.id } }), 0);
    assert.equal(await prisma.match.count({ where: { eventId: real.id } }), 0);
  } finally {
    await deleteRecord("events", demo.id, null);
    await deleteRecord("events", real.id, null);
    await prisma.$disconnect();
  }
});
