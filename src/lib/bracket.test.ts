import test from "node:test";
import assert from "node:assert/strict";
import { campaignTie, dependentNodePath, planBracket, rankCampaigns, roundName, winnerFromOfficial, type Campaign } from "./bracket";
function teams(count: number): Campaign[] { return Array.from({ length: count }, (_, index) => ({ teamId: `T${index + 1}`, name: `Equipe ${String(index + 1).padStart(2, "0")}`, groupId: `G${Math.floor(index / 2)}`, groupName: `Grupo ${Math.floor(index / 2)}`, groupPosition: index % 2 + 1, played: 2, points: count - index, wins: count - index, diff: count - index, scored: count - index })); }
for (const count of [8, 14, 16, 24, 32]) test(`chave de ${count} equipes produz byes e ${count - 1} partidas`, () => {
  const plan = planBracket(teams(count), "SEEDED", true);
  assert.equal(plan.bracketSize, 2 ** Math.ceil(Math.log2(count)));
  assert.equal(plan.byeCount, plan.bracketSize - count);
  assert.equal(plan.matchCount, count - 1);
  assert.equal(plan.firstRoundMatches, count - plan.bracketSize / 2);
  assert.equal(plan.rounds.at(-1)?.length, 1);
  const firstIds = plan.rounds[0].flatMap(node => node.slots.map(slot => slot.teamId).filter(Boolean));
  assert.equal(new Set(firstIds).size, count);
  assert.equal(plan.rounds[0].filter(node => node.byeWinnerId).length, plan.byeCount);
  for (let round = 1; round < plan.rounds.length; round++) {
    assert.equal(plan.rounds[round].length, plan.rounds[round - 1].length / 2);
    const sources = plan.rounds[round].flatMap(node => node.slots.map(slot => slot.sourcePosition));
    assert.deepEqual(sources, Array.from({ length: plan.rounds[round - 1].length }, (_, index) => index));
  }
});
test("14 classificadas: duas melhores pulam a preliminar, seis jogos levam às quartas", () => {
  const plan = planBracket(teams(14), "SEEDED");
  assert.equal(plan.firstRoundMatches, 6);
  assert.equal(plan.rounds[1].length, 4);
  assert.equal(plan.rounds[2].length, 2);
  assert.equal(plan.rounds[3].length, 1);
  assert.deepEqual(plan.rounds[0].filter(node => node.byeWinnerId).map(node => node.byeWinnerId).sort(), ["T1", "T2"]);
  assert.deepEqual(plan.rounds[1].flatMap(node => node.slots.map(slot => slot.teamId).filter(Boolean)).sort(), ["T1", "T2"]);
  assert.equal(roundName(16, 1), "Quartas de final");
});
test("evita confronto do mesmo grupo quando uma troca das posições inferiores resolve", () => {
  const source = teams(8);
  source.forEach((team, index) => { team.groupId = `G${[0, 1, 2, 3, 2, 3, 1, 0][index]}`; });
  const without = planBracket(source, "SEEDED", false);
  const withAvoidance = planBracket(source, "SEEDED", true);
  assert.ok(without.unavoidableSameGroup > 0);
  assert.equal(withAvoidance.unavoidableSameGroup, 0);
  assert.ok(withAvoidance.avoidedSameGroup > 0);
});
test("campanhas gerais usam médias e detectam empate exato sem decidir por sorteio", () => {
  const input = teams(3);
  input[0].points = 6; input[0].played = 3;
  input[1].points = 4; input[1].played = 2;
  input[0].wins = input[1].wins = 2; input[0].diff = input[1].diff = 4; input[0].scored = input[1].scored = 8;
  input[0].groupPosition = input[1].groupPosition = 1;
  assert.equal(rankCampaigns(input)[0].teamId, "T2");
  input[0].played = input[1].played = 2; input[0].points = input[1].points = 4;
  assert.equal(campaignTie(input[0], input[1]), true);
});
test("vencedora só avança com homologação; empate exige regra manual explícita", () => {
  const match = { officialAt: null as Date | null, homeTeamId: "A", awayTeamId: "B", homeScore: 10, awayScore: 5 };
  assert.equal(winnerFromOfficial(match, "SCORE"), null);
  match.officialAt = new Date();
  assert.equal(winnerFromOfficial(match, "SCORE"), "A");
  match.awayScore = 10;
  assert.equal(winnerFromOfficial(match, "SCORE"), null);
  assert.equal(winnerFromOfficial(match, "MANUAL", "B"), "B");
  assert.equal(winnerFromOfficial(match, "MANUAL", "C"), null);
  match.officialAt = null;
  assert.equal(winnerFromOfficial(match, "MANUAL", "B"), null);
});
test("correção anterior invalida apenas a cadeia dependente até a final", () => {
  const edges = [
    { sourceNodeId: "P1", nodeId: "Q1" }, { sourceNodeId: "P2", nodeId: "Q1" },
    { sourceNodeId: "P3", nodeId: "Q2" }, { sourceNodeId: "P4", nodeId: "Q2" },
    { sourceNodeId: "Q1", nodeId: "S1" }, { sourceNodeId: "Q2", nodeId: "S1" },
    { sourceNodeId: "S1", nodeId: "F" }, { sourceNodeId: "S2", nodeId: "F" }
  ];
  assert.deepEqual(dependentNodePath("P1", edges), ["Q1", "S1", "F"]);
  assert.deepEqual(dependentNodePath("P3", edges), ["Q2", "S1", "F"]);
  assert.deepEqual(dependentNodePath("F", edges), []);
  assert.throws(() => dependentNodePath("P1", [...edges, { sourceNodeId: "Q1", nodeId: "F" }]), /dois confrontos/);
});
