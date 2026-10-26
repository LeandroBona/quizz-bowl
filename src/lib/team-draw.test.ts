import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDraw, drawTeams, type DrawParticipant } from "./team-draw";

function roster(counts: Record<string, number>): DrawParticipant[] {
  return Object.entries(counts).flatMap(([phase, count]) => Array.from({ length: count }, (_, index) => ({ id: `${phase}-${index}`, name: `Aluno ${phase} ${index}`, phaseId: phase, phaseName: `${phase}ª fase` })));
}
function assertAllAssigned(participants: DrawParticipant[], teams: ReturnType<typeof drawTeams>["teams"]) {
  const ids = teams.flatMap(team => team.members.map(member => member.id));
  assert.equal(ids.length, participants.length);
  assert.equal(new Set(ids).size, participants.length);
  assert.deepEqual(new Set(ids), new Set(participants.map(person => person.id)));
  for (const team of teams) assert.equal(team.members.length, team.targetSize);
}

test("117 alunos em 21 equipes: 9 de cinco, 12 de seis e todas as fases presentes", () => {
  const people = roster({ primeira: 41, quarta: 31, sexta: 21, oitava: 24 });
  const result = drawTeams(people, { teamCount: 21, minSize: 5, maxSize: 6 }, "cenario-117");
  assert.equal(result.analysis.fullDiversityPossible, true);
  assert.equal(result.teams.filter(team => team.members.length === 5).length, 9);
  assert.equal(result.teams.filter(team => team.members.length === 6).length, 12);
  assertAllAssigned(people, result.teams);
  for (const team of result.teams) for (const phase of result.analysis.phases) assert.ok(team.phaseCounts[phase.id] >= 1, `${team.name} sem ${phase.name}`);
  for (const phase of result.analysis.phases) {
    const counts = result.teams.map(team => team.phaseCounts[phase.id] || 0);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `Fase ${phase.name} concentrada`);
  }
});

test("fases desiguais preservam tamanhos e espalham a fase escassa", () => {
  const people = roster({ A: 13, B: 2, C: 12 });
  const result = drawTeams(people, { teamCount: 5, minSize: 5, maxSize: 6 }, "desigual");
  assert.equal(result.analysis.fullDiversityPossible, false);
  assertAllAssigned(people, result.teams);
  assert.equal(result.teams.filter(team => team.phaseCounts.B === 1).length, 2);
  assert.ok(result.analysis.warnings.some(warning => warning.includes("Bª fase")));
});

test("limites impossíveis produzem explicação e nenhuma equipe provisória", () => {
  const people = roster({ A: 7 });
  const result = drawTeams(people, { teamCount: 2, minSize: 5, maxSize: 6 }, "impossivel");
  assert.equal(result.analysis.feasible, false);
  assert.equal(result.teams.length, 0);
  assert.ok(result.analysis.warnings[0].includes("não é possível"));
});

test("quantidade de equipes incompatível é ajustada para a faixa viável", () => {
  const people = roster({ A: 15, B: 15 });
  const result = drawTeams(people, { teamCount: 10, minSize: 5, maxSize: 6 }, "ajuste");
  assert.equal(result.analysis.effectiveTeamCount, 6);
  assert.equal(result.teams.length, 6);
  assert.ok(result.analysis.warnings.some(warning => warning.includes("5 a 6")));
  assertAllAssigned(people, result.teams);
});

test("participantes excedentes são distribuídos sem perder ninguém", () => {
  const people = roster({ A: 12, B: 11 });
  const config = { teamCount: 4, minSize: 5, maxSize: 6 };
  const result = drawTeams(people, config, "excedentes");
  assert.equal(result.teams.filter(team => team.members.length === 6).length, 3);
  assert.equal(result.teams.filter(team => team.members.length === 5).length, 1);
  assertAllAssigned(people, result.teams);
  assert.deepEqual(drawTeams(people, config, "excedentes"), result);
});

test("configuração vazia ou inválida é rejeitada", () => {
  assert.equal(analyzeDraw([], { teamCount: 2, minSize: 5, maxSize: 6 }).feasible, false);
  assert.equal(analyzeDraw(roster({ A: 10 }), { teamCount: 2, minSize: 7, maxSize: 5 }).feasible, false);
});
