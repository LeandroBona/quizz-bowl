import test from "node:test";
import assert from "node:assert/strict";
import { demoCategories, demoParticipantNames, demoPhases, demoQuestions, demoGroupScore } from "./demo-data";
import { drawTeams } from "./team-draw";
import { makeCsv, makePdf } from "./export-files";
import { contrastRatio } from "./color-contrast";
import { eventSettingsInput, defaultEventSettings, defaultPresentationSettings, defaultQuestionSettings } from "../server/event-settings";

test("cenário fictício contém 117 alunos nas quatro fases e 180 questões em cinco disciplinas", () => {
  const people = demoParticipantNames(), questions = demoQuestions();
  assert.equal(people.length, 117); assert.deepEqual(demoPhases.map(phase => people.filter(person => person.phaseName === phase.name).length), [41, 31, 21, 24]);
  assert.equal(questions.length, 180); assert.deepEqual(demoCategories.map(category => questions.filter(question => question.category === category).length), [36, 36, 36, 36, 36]);
  assert.equal(new Set(questions.map(question => question.statement)).size, questions.length);
  assert.ok(questions.every(question => question.alternatives.includes(question.answer)));
});

test("cenário fictício gera nove equipes de cinco e doze de seis com diversidade completa", () => {
  const phases = new Map(demoPhases.map((phase, index) => [phase.name, `phase-${index}`]));
  const people = demoParticipantNames().map((person, index) => ({ id: `p-${index}`, name: person.name, phaseId: phases.get(person.phaseName)!, phaseName: person.phaseName }));
  const draw = drawTeams(people, { teamCount: 21, minSize: 5, maxSize: 6 }, "seed-demo-test");
  assert.equal(draw.teams.length, 21);
  assert.equal(draw.teams.filter(team => team.members.length === 5).length, 9);
  assert.equal(draw.teams.filter(team => team.members.length === 6).length, 12);
  assert.ok(draw.teams.every(team => new Set(team.members.map(person => person.phaseName)).size === 4));
  assert.equal(new Set(draw.teams.flatMap(team => team.members.map(person => person.id))).size, 117);
});

test("placares fictícios são decisivos e formam classificação sem empate de confronto", () => {
  for (let group = 0; group < 7; group++) for (let home = 0; home < 3; home++) for (let away = 0; away < 3; away++) if (home !== away) {
    const score = demoGroupScore(home, away, group);
    assert.notEqual(score.homeScore, score.awayScore);
    assert.equal(score.homeScore > score.awayScore, home < away);
  }
});

test("CSV cita campos e PDF produz estrutura paginada legível", () => {
  const table = { title: "Quiz Bowl · Equipes", columns: ["Equipe", "Integrante"], rows: Array.from({ length: 100 }, (_, index) => [`Equipe ${index + 1}`, index === 0 ? 'Ana; "Bia"' : `Aluno ${index + 1}`]) };
  const csv = makeCsv(table); const pdf = makePdf(table);
  assert.ok(csv.startsWith("\uFEFF")); assert.match(csv, /"Ana; ""Bia"""/);
  assert.ok(pdf.toString("latin1").startsWith("%PDF-1.4"));
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 3);
  assert.match(pdf.toString("latin1"), /startxref\n\d+\n%%EOF$/);
});

test("configuração rejeita estrutura incompatível e cores sem contraste", () => {
  const valid = { eventId: "evt", name: "Campeonato", description: null, venue: null, startsAt: null, endsAt: null, rules: null, status: "PLANNED", ...defaultEventSettings, ...defaultQuestionSettings, ...defaultPresentationSettings };
  assert.equal(eventSettingsInput.safeParse(valid).success, true);
  assert.equal(eventSettingsInput.safeParse({ ...valid, teamCount: 20 }).success, false);
  assert.equal(eventSettingsInput.safeParse({ ...valid, backgroundColor: "#FFFFFF" }).success, false);
  assert.ok(contrastRatio("#FFFFFF", "#06142E") >= 4.5);
});
