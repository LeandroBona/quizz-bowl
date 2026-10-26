import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { confirmGroups, createPhase, previewGroups } from "../src/server/group-stage";
import { listRecords } from "../src/server/resources";

test("confirmar grupos cria confrontos e lista Rodada 1 a partir do Grupo A", async () => {
  const event = await prisma.event.create({ data: { name: "Teste da ordem das partidas" } });
  try {
    await prisma.team.createMany({ data: Array.from({ length: 6 }, (_, index) => ({ eventId: event.id, name: `Equipe ${index + 1}` })) });
    const phase = await createPhase({ eventId: event.id, name: "Grupos", groupCount: 2, teamsPerGroup: 3, qualifiersPerGroup: 2, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: true, tieBreakers: ["POINTS", "WINS", "DIFF", "SCORED", "HEAD_TO_HEAD", "MANUAL"], format: "ROUND_ROBIN_SINGLE" });
    const preview = await previewGroups(event.id, phase.id);
    await confirmGroups(event.id, phase.id, preview.signature, preview.groups.map(group => ({ name: group.name, teamIds: group.teams.map(team => team.id) })));
    const matches = await listRecords("matches", event.id);
    assert.equal(matches.length, 6);
    assert.deepEqual(matches.map(match => {
      if (!("round" in match)) throw new Error("Lista de partidas inválida");
      return `${match.round} · ${match.group?.name}`;
    }), [
      "Rodada 1 · Grupo A", "Rodada 1 · Grupo B",
      "Rodada 2 · Grupo A", "Rodada 2 · Grupo B",
      "Rodada 3 · Grupo A", "Rodada 3 · Grupo B",
    ]);
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.$disconnect();
  }
});
