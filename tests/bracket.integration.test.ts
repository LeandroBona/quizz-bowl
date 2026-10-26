import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { createPhase, previewGroups, confirmGroups } from "../src/server/group-stage";
import { bracketContext, previewBracket, confirmBracket, saveBracketScore, homologateBracketScore, revokeBracketScore, swapBracketSlots } from "../src/server/bracket";

test("14 classificadas geram byes, avançam por resultado oficial e correção invalida dependências", async () => {
  const event = await prisma.event.create({ data: { name: "Teste de chaveamento" } });
  try {
    await prisma.team.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ eventId: event.id, name: `Equipe ${String(index + 1).padStart(2, "0")}` })) });
    const phase = await createPhase({ eventId: event.id, name: "Fase de grupos", groupCount: 7, teamsPerGroup: 3, qualifiersPerGroup: 2, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: false, tieBreakers: ["POINTS", "WINS", "DIFF", "SCORED", "HEAD_TO_HEAD", "MANUAL"], format: "ROUND_ROBIN_SINGLE" });
    const groups = await previewGroups(event.id, phase.id);
    await confirmGroups(event.id, phase.id, groups.signature, groups.groups.map(group => ({ name: group.name, teamIds: group.teams.map(team => team.id) })));
    const groupRows = await prisma.group.findMany({ where: { phaseId: phase.id }, include: { teams: true, matches: true }, orderBy: { name: "asc" } });
    for (let groupIndex = 0; groupIndex < groupRows.length; groupIndex++) {
      const group = groupRows[groupIndex], [a, b, c] = group.teams.map(team => team.teamId);
      for (const match of group.matches) {
        const points = match.homeTeamId === a && match.awayTeamId === b || match.homeTeamId === b && match.awayTeamId === a ? [a, b, 10 + groupIndex] : match.homeTeamId === a && match.awayTeamId === c || match.homeTeamId === c && match.awayTeamId === a ? [a, c, 20 + groupIndex] : [b, c, 5 + groupIndex];
        await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED", officialAt: new Date(), homeScore: match.homeTeamId === points[0] ? Number(points[2]) : 0, awayScore: match.awayTeamId === points[0] ? Number(points[2]) : 0 } });
      }
    }
    const config = { eventId: event.id, phaseId: phase.id, mode: "SEEDED" as const, avoidSameGroup: true, tieRule: "SCORE" as const, acceptCampaignTie: true };
    const preview = await previewBracket(config);
    assert.equal(preview.plan.teamCount, 14);
    assert.equal(preview.plan.byeCount, 2);
    assert.equal(preview.plan.firstRoundMatches, 6);
    assert.equal(preview.plan.matchCount, 13);
    await confirmBracket({ ...config, orderedIds: preview.orderedIds, signature: preview.signature });
    let state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.filter(node => node.match).length, 6);
    assert.equal(state.nodes.filter(node => node.winnerTeamId).length, 2);
    assert.deepEqual(state.nodes.filter(node => node.roundIndex === 0 && node.winnerTeamId).map(node => node.winnerTeamId).sort(), preview.orderedIds.slice(0, 2).sort());
    const firstRound = state.nodes.filter(node => node.roundIndex === 0 && node.match);
    const firstHome = firstRound[0].slots[0], secondHome = firstRound[1].slots[0];
    await swapBracketSlots(event.id, state.id, firstHome.id, secondHome.id);
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.find(node => node.id === firstRound[0].id)?.slots[0].teamId, secondHome.teamId);
    assert.equal(state.nodes.find(node => node.id === firstRound[1].id)?.slots[0].teamId, firstHome.teamId);
    const first = state.nodes.find(node => node.id === firstRound[0].id)!.match!;
    await saveBracketScore(event.id, first.id, 12, 0);
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.find(node => node.matchId === first.id)?.winnerTeamId, null);
    await homologateBracketScore(event.id, first.id);
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.find(node => node.matchId === first.id)?.winnerTeamId, first.homeTeamId);
    const destination = state.nodes.find(node => node.roundIndex === 1 && node.slots.some(slot => slot.sourceNodeId === state.nodes.find(source => source.matchId === first.id)?.id))!;
    assert.ok(destination.slots.some(slot => slot.teamId === first.homeTeamId));
    // Changing an earlier official result clears its dependent slot and keeps the old match history.
    await saveBracketScore(event.id, first.id, 0, 14, false, "Placar invertido após revisão");
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.find(node => node.id === destination.id)?.slots.find(slot => slot.sourceNodeId === state.nodes.find(source => source.matchId === first.id)?.id)?.teamId, null);
    const oldHistory = await prisma.matchEvent.findMany({ where: { matchId: first.id } });
    assert.ok(oldHistory.some(row => row.kind === "SCORE_CORRECTED"));
    await homologateBracketScore(event.id, first.id);
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.find(node => node.matchId === first.id)?.winnerTeamId, first.awayTeamId);
    for (const node of state.nodes.filter(node => node.roundIndex === 0 && node.match && node.match.id !== first.id)) { await saveBracketScore(event.id, node.match!.id, 1, 0); await homologateBracketScore(event.id, node.match!.id); }
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.filter(node => node.roundIndex === 1 && node.match).length, 4);
    const quarter = state.nodes.find(node => node.roundIndex === 1 && node.slots.some(slot => slot.sourceNodeId === state.nodes.find(source => source.matchId === first.id)?.id))!.match!;
    await saveBracketScore(event.id, quarter.id, 3, 1); await homologateBracketScore(event.id, quarter.id);
    await assert.rejects(() => revokeBracketScore(event.id, first.id), /partida dependente/i);
    await revokeBracketScore(event.id, first.id, true);
    const cancelled = await prisma.match.findUniqueOrThrow({ where: { id: quarter.id } });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.officialAt, null);
    assert.ok(await prisma.matchEvent.count({ where: { matchId: quarter.id, kind: "BRACKET_INVALIDATED" } }));
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.nodes.find(node => node.roundIndex === 1 && node.id === destination.id)?.winnerTeamId, null);
    const occupiedByRound = new Map<number, string[]>();
    for (const node of state.nodes) for (const slot of node.slots) if (slot.teamId) occupiedByRound.set(node.roundIndex, [...(occupiedByRound.get(node.roundIndex) || []), slot.teamId]);
    for (const ids of occupiedByRound.values()) assert.equal(new Set(ids).size, ids.length);
  } finally { await prisma.bracket.deleteMany({ where: { eventId: event.id } }); await prisma.event.delete({ where: { id: event.id } }); await prisma.$disconnect(); }
});

test("mediação eliminatória só promove vencedora após homologação e revoga o título ao corrigir", async () => {
  const event = await prisma.event.create({ data: { name: "Teste de final mediada" } });
  try {
    const teams = await Promise.all(["Azul", "Branca", "Cinza", "Dourada"].map(name => prisma.team.create({ data: { eventId: event.id, name } })));
    const phase = await createPhase({ eventId: event.id, name: "Grupos", groupCount: 2, teamsPerGroup: 2, qualifiersPerGroup: 1, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: false, tieBreakers: ["POINTS", "WINS", "DIFF", "SCORED", "HEAD_TO_HEAD", "MANUAL"], format: "ROUND_ROBIN_SINGLE" });
    const groupPreview = await previewGroups(event.id, phase.id);
    await confirmGroups(event.id, phase.id, groupPreview.signature, groupPreview.groups.map(group => ({ name: group.name, teamIds: group.teams.map(team => team.id) })));
    const groupMatches = await prisma.match.findMany({ where: { eventId: event.id } });
    for (const match of groupMatches) await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED", officialAt: new Date(), homeScore: 1, awayScore: 0 } });
    const config = { eventId: event.id, phaseId: phase.id, mode: "SEEDED" as const, avoidSameGroup: true, tieRule: "SCORE" as const, acceptCampaignTie: true };
    const preview = await previewBracket(config);
    await confirmBracket({ ...config, orderedIds: preview.orderedIds, signature: preview.signature });
    let state = (await bracketContext(event.id, phase.id)).bracket!;
    const final = state.nodes[0].match!;
    const question = await prisma.question.create({ data: { eventId: event.id, statement: "Pergunta da final?", answer: "A", type: "SHORT_ANSWER", difficulty: "EASY", points: 10, timeSeconds: 30, isActive: true, status: "READY" } });
    const { assignMatchQuestions } = await import("../src/server/match-questions");
    const { performMatchAction } = await import("../src/server/match-session");
    await assignMatchQuestions(final.id, event.id, [question.id]);
    await performMatchAction(final.id, { action: "configure", eventId: event.id, mode: "ALTERNATING", wrongPenalty: 0, defaultDurationSeconds: 30 });
    await performMatchAction(final.id, { action: "start", eventId: event.id });
    await performMatchAction(final.id, { action: "present", eventId: event.id });
    await performMatchAction(final.id, { action: "answer", eventId: event.id, teamId: final.homeTeamId, response: "A", points: 10 });
    await performMatchAction(final.id, { action: "finish", eventId: event.id });
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.championTeamId, null);
    await performMatchAction(final.id, { action: "homologate", eventId: event.id });
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.championTeamId, final.homeTeamId);
    await performMatchAction(final.id, { action: "revoke", eventId: event.id, invalidateDependents: false });
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.championTeamId, null);
    await performMatchAction(final.id, { action: "adjust", eventId: event.id, teamId: final.awayTeamId, delta: 20, reason: "Correção após revisão" });
    await performMatchAction(final.id, { action: "homologate", eventId: event.id });
    state = (await bracketContext(event.id, phase.id)).bracket!;
    assert.equal(state.championTeamId, final.awayTeamId);
    assert.ok(teams.some(team => team.id === state.championTeamId));
  } finally { await prisma.bracket.deleteMany({ where: { eventId: event.id } }); await prisma.event.delete({ where: { id: event.id } }); await prisma.$disconnect(); }
});
