import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { confirmGroups, createPhase, generateFixtures, homologateGroupResult, previewGroups, saveGroupResult, swapGroupTeams, updatePhase } from "../src/server/group-stage";
import { deleteRecord } from "../src/server/resources";
import { defaultTieBreakers } from "../src/lib/group-stage";

test("a fase pode ser configurada antes das equipes, mas o sorteio espera a formação delas", async () => {
  const event = await prisma.event.create({ data: { name: "Teste de configuração antecipada" } });
  try {
    const config = { eventId: event.id, name: "Fase de grupos", groupCount: 7, teamsPerGroup: 3, qualifiersPerGroup: 2, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: false, tieBreakers: [...defaultTieBreakers], format: "ROUND_ROBIN_SINGLE" as const };
    const phase = await createPhase(config);
    assert.equal(phase.groupCount, 7);
    await updatePhase(phase.id, { ...config, winPoints: 4 });
    await assert.rejects(() => previewGroups(event.id, phase.id), /duas equipes por grupo/i);
    await prisma.team.createMany({ data: Array.from({ length: 23 }, (_, index) => ({ eventId: event.id, name: `Equipe ${index + 1}` })) });
    await assert.rejects(() => previewGroups(event.id, phase.id), /23 equipes; 7 grupos de 3 exigem 21/i);
    await updatePhase(phase.id, { ...config, teamsPerGroup: null, winPoints: 4 });
    const preview = await previewGroups(event.id, phase.id);
    assert.equal(preview.groups.length, 7);
    assert.equal(preview.groups.reduce((total, group) => total + group.teams.length, 0), 23);
    assert.ok(preview.groups.every(group => group.teams.length === 3 || group.teams.length === 4));
    const confirmed = await confirmGroups(event.id, phase.id, preview.signature, preview.groups.map(group => ({ name: group.name, teamIds: group.teams.map(team => team.id) })));
    assert.equal(confirmed.count, 27);
    assert.equal(await prisma.match.count({ where: { group: { phaseId: phase.id } } }), 27);
    await assert.rejects(() => generateFixtures(event.id, phase.id), /Já existem confrontos/);
    const first = preview.groups[0].teams[0].id;
    const second = preview.groups[1].teams[0].id;
    const swapped = await swapGroupTeams(event.id, phase.id, first, second);
    assert.equal(swapped.updatedMatches, 6);
    const groups = await prisma.group.findMany({ where: { phaseId: phase.id }, include: { teams: true, matches: true } });
    for (const group of groups) {
      const members = new Set(group.teams.map(team => team.teamId));
      assert.ok(group.matches.every(match => members.has(match.homeTeamId) && members.has(match.awayTeamId)));
    }
    const touched = await prisma.match.findFirstOrThrow({ where: { group: { phaseId: phase.id }, OR: [{ homeTeamId: second }, { awayTeamId: second }] } });
    await prisma.match.update({ where: { id: touched.id }, data: { status: "LIVE" } });
    await assert.rejects(() => swapGroupTeams(event.id, phase.id, first, second), /partidas iniciadas/);
  } finally {
    await deleteRecord("events", event.id, null);
    await prisma.$disconnect();
  }
});

test("correção do resultado de grupo exige motivo, revoga homologação e mantém histórico", async () => {
  const event = await prisma.event.create({ data: { name: "Teste de correção do grupo" } });
  try {
    await prisma.team.createMany({ data: [{ eventId: event.id, name: "Azul" }, { eventId: event.id, name: "Branca" }] });
    const phase = await createPhase({ eventId: event.id, name: "Grupos", groupCount: 1, teamsPerGroup: 2, qualifiersPerGroup: 1, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: false, tieBreakers: [...defaultTieBreakers], format: "ROUND_ROBIN_SINGLE" });
    const preview = await previewGroups(event.id, phase.id);
    await confirmGroups(event.id, phase.id, preview.signature, preview.groups.map(group => ({ name: group.name, teamIds: group.teams.map(team => team.id) })));
    const match = await prisma.match.findFirstOrThrow({ where: { eventId: event.id } });
    await saveGroupResult(event.id, match.id, 10, 0);
    await homologateGroupResult(event.id, match.id, true);
    await assert.rejects(() => saveGroupResult(event.id, match.id, 5, 10), /Justifique/);
    const corrected = await saveGroupResult(event.id, match.id, 5, 10, "Correção da súmula");
    assert.equal(corrected.officialAt, null);
    assert.equal(corrected.awayScore, 10);
    const events = await prisma.matchEvent.findMany({ where: { matchId: match.id }, orderBy: { createdAt: "asc" } });
    assert.ok(events.some(row => row.kind === "SCORE_CORRECTED"));
    assert.ok(events.some(row => row.kind === "HOMOLOGATE"));
  } finally {
    await deleteRecord("events", event.id, null);
    await prisma.$disconnect();
  }
});
