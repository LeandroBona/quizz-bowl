import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { defaultEventSettings, defaultQuestionSettings, defaultPresentationSettings } from "@/server/event-settings";
import { demoGroupScore, demoParticipantNames, demoPhases, demoQuestions, demoRandom } from "@/lib/demo-data";
import { drawTeams } from "@/lib/team-draw";
import { calculateStandings, defaultTieBreakers, drawGroups, groupLabel, roundRobin } from "@/lib/group-stage";
import { bracketContext, confirmBracket, homologateBracketScore, previewBracket, saveBracketScore } from "@/server/bracket";

export const demoActions = ["participants", "teams", "groups", "fixtures", "results", "standings", "bracket", "knockout", "champion"] as const;
export type DemoAction = typeof demoActions[number];
type Tx = Prisma.TransactionClient;
const serial = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 } as const;

async function requireStage(tx: Tx, eventId: string, stage: number) {
  const run = await tx.demoRun.findUnique({ where: { eventId }, include: { event: { select: { isDemo: true } } } });
  if (!run?.event.isDemo) throw new ApiError(404, "Demonstração não encontrada.");
  if (run.stage !== stage) throw new ApiError(409, `Esta etapa exige a conclusão da etapa ${stage}. Atualize a simulação.`);
  return run;
}
async function advanceStage(tx: Tx, eventId: string, from: number) {
  const changed = await tx.demoRun.updateMany({ where: { eventId, stage: from }, data: { stage: from + 1 } });
  if (changed.count !== 1) throw new ApiError(409, "A simulação mudou em outra janela. Atualize antes de continuar.");
}
export async function createDemo() {
  const seed = randomUUID();
  return prisma.$transaction(async tx => {
    const event = await tx.event.create({ data: { name: `Quiz Bowl · Demonstração ${new Date().toLocaleDateString("pt-BR")}`, description: "Campeonato fictício para testar o fluxo completo sem alterar eventos reais.", status: "PLANNED", isDemo: true } });
    await tx.demoRun.create({ data: { eventId: event.id, seed } });
    await tx.eventSettings.create({ data: { eventId: event.id, ...defaultEventSettings } });
    await tx.questionSettings.create({ data: { eventId: event.id, ...defaultQuestionSettings } });
    await tx.eventPresentation.create({ data: { eventId: event.id, ...defaultPresentationSettings, welcomeMessage: "Bem-vindos à simulação do Quiz Bowl!" } });
    return event;
  }, serial);
}

export async function demoState(eventId: string) {
  const run = await prisma.demoRun.findUnique({ where: { eventId }, include: { event: { select: { id: true, name: true, isDemo: true } } } });
  if (!run?.event.isDemo) return { isDemo: false };
  const [phases, participants, teams, groupPhase, groups, matches, bracket] = await Promise.all([
    prisma.coursePhase.findMany({ where: { eventId }, select: { id: true, name: true, _count: { select: { participants: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.participant.count({ where: { eventId } }), prisma.team.count({ where: { eventId } }),
    prisma.groupPhase.findFirst({ where: { eventId }, select: { id: true }, orderBy: { createdAt: "desc" } }),
    prisma.group.count({ where: { eventId } }),
    prisma.match.aggregate({ where: { eventId }, _count: { _all: true }, _sum: { homeScore: true } }),
    prisma.bracket.findFirst({ where: { eventId }, select: { id: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const officialMatches = await prisma.match.count({ where: { eventId, officialAt: { not: null } } });
  const bracketState = bracket ? (await bracketContext(eventId, groupPhase?.id)).bracket : null;
  return { isDemo: true, event: run.event, stage: run.stage, phases: phases.map(phase => ({ name: phase.name, count: phase._count.participants })), participants, teams, groups, matches: matches._count._all, officialMatches, qualified: bracketState?.teamCount ?? (run.stage >= 6 ? 14 : 0), bracketMatches: bracketState?.officialMatches ?? 0, championTeamId: bracketState?.championTeamId ?? null, championName: bracketState?.nodes.at(-1)?.winnerTeam?.name ?? null, groupPhaseId: groupPhase?.id ?? null };
}

async function participantsStep(eventId: string) {
  await prisma.$transaction(async tx => {
    await requireStage(tx, eventId, 0);
    await tx.coursePhase.createMany({ data: demoPhases.map((phase, index) => ({ eventId, name: phase.name, sortOrder: index })) });
    const phases = await tx.coursePhase.findMany({ where: { eventId }, select: { id: true, name: true } });
    const byName = new Map(phases.map(phase => [phase.name, phase.id]));
    await tx.participant.createMany({ data: demoParticipantNames().map(person => ({ eventId, name: person.name, phaseId: byName.get(person.phaseName)!, participationStatus: "ACTIVE" })) });
    await tx.question.createMany({ data: demoQuestions().map(question => ({ ...question, eventId })) });
    await advanceStage(tx, eventId, 0);
  }, serial);
}
async function teamsStep(eventId: string) {
  await prisma.$transaction(async tx => {
    const run = await requireStage(tx, eventId, 1);
    const people = await tx.participant.findMany({ where: { eventId }, include: { phase: true } });
    const draw = drawTeams(people.map(person => ({ id: person.id, name: person.name, phaseId: person.phaseId!, phaseName: person.phase!.name })), { teamCount: 21, minSize: 5, maxSize: 6 }, run.seed);
    if (!draw.analysis.feasible || draw.teams.length !== 21 || !draw.analysis.fullDiversityPossible) throw new ApiError(409, "A distribuição fictícia não atende às regras esperadas.");
    for (const team of draw.teams) await tx.team.create({ data: { eventId, name: team.name, minMembers: 5, maxMembers: 6, members: { create: team.members.map(person => ({ participantId: person.id })) } } });
    await advanceStage(tx, eventId, 1);
  }, serial);
}
async function groupsStep(eventId: string) {
  await prisma.$transaction(async tx => {
    const run = await requireStage(tx, eventId, 2);
    const teams = await tx.team.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    if (teams.length !== 21) throw new ApiError(409, "A simulação exige 21 equipes antes do sorteio dos grupos.");
    const phase = await tx.groupPhase.create({ data: { eventId, name: "Fase de grupos · Demonstração", groupCount: 7, teamsPerGroup: 3, qualifiersPerGroup: 2, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: false, tieBreakers: defaultTieBreakers, format: "ROUND_ROBIN_SINGLE", confirmedAt: new Date() } });
    const drawn = drawGroups(teams, 7, 3, 2, demoRandom(`${run.seed}:groups`));
    for (let index = 0; index < drawn.length; index++) {
      const group = await tx.group.create({ data: { eventId, phaseId: phase.id, name: `Grupo ${groupLabel(index)}`, stage: phase.name, teams: { create: drawn[index].map(team => ({ teamId: team.id, phaseId: phase.id })) } } });
      await tx.match.createMany({ data: roundRobin(drawn[index].map(team => team.id)).map(fixture => ({ eventId, groupId: group.id, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, round: `Rodada ${fixture.round}`, fixtureKey: `${phase.id}:${group.id}:${[fixture.homeTeamId, fixture.awayTeamId].sort().join(":")}` })) });
    }
    await advanceStage(tx, eventId, 2);
  }, serial);
}
async function fixturesStep(eventId: string) {
  await prisma.$transaction(async tx => {
    await requireStage(tx, eventId, 3);
    const groups = await tx.group.findMany({ where: { eventId, phaseId: { not: null } }, include: { teams: true, matches: true } });
    if (groups.length !== 7 || groups.some(group => group.teams.length !== 3 || group.matches.length !== 3)) throw new ApiError(409, "Os confrontos automáticos dos sete grupos ainda não estão completos.");
    await advanceStage(tx, eventId, 3);
  }, serial);
}
async function resultsStep(eventId: string) {
  await prisma.$transaction(async tx => {
    await requireStage(tx, eventId, 4);
    const groups = await tx.group.findMany({ where: { eventId, phaseId: { not: null } }, include: { teams: { include: { team: { select: { name: true } } } }, matches: true }, orderBy: { name: "asc" } });
    if (groups.length !== 7 || groups.some(group => group.matches.length !== 3)) throw new ApiError(409, "Os 21 confrontos da fase de grupos ainda não estão completos.");
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index], order = [...group.teams].sort((a, b) => a.team.name.localeCompare(b.team.name, "pt-BR"));
      for (const match of group.matches) {
        const homeRank = order.findIndex(team => team.teamId === match.homeTeamId), awayRank = order.findIndex(team => team.teamId === match.awayTeamId);
        const score = demoGroupScore(homeRank, awayRank, index);
        await tx.match.update({ where: { id: match.id }, data: { ...score, status: "FINISHED", officialAt: new Date() } });
        await tx.matchEvent.create({ data: { matchId: match.id, kind: "DEMO_HOMOLOGATE", details: { ...score, scenario: "demo", group: group.name } } });
      }
    }
    await advanceStage(tx, eventId, 4);
  }, serial);
}
async function standingsStep(eventId: string) {
  await prisma.$transaction(async tx => {
    await requireStage(tx, eventId, 5);
    const groups = await tx.group.findMany({ where: { eventId, phaseId: { not: null } }, include: { teams: { include: { team: { select: { name: true } } } }, matches: true } });
    const tables = groups.map(group => calculateStandings(group.teams.map(member => ({ id: member.teamId, name: member.team.name, manualTieRank: member.manualTieRank })), group.matches, { winPoints: 3, drawPoints: 1, lossPoints: 0, qualifiersPerGroup: 2, tieBreakers: defaultTieBreakers }));
    if (tables.length !== 7 || tables.some(table => table.filter(row => row.qualification === "QUALIFIED").length !== 2)) throw new ApiError(409, "A classificação ainda não contém 14 equipes definidas.");
    await advanceStage(tx, eventId, 5);
  }, serial);
}
async function bracketStep(eventId: string) {
  const run = await prisma.demoRun.findUnique({ where: { eventId } });
  if (run?.stage !== 6) throw new ApiError(409, "Atualize a classificação antes de gerar o mata-mata.");
  const phase = await prisma.groupPhase.findFirstOrThrow({ where: { eventId } });
  if (!await prisma.bracket.findUnique({ where: { phaseId: phase.id } })) {
    const config = { eventId, phaseId: phase.id, mode: "SEEDED" as const, avoidSameGroup: true, tieRule: "SCORE" as const, acceptCampaignTie: false };
    const preview = await previewBracket(config);
    if (preview.plan.teamCount !== 14 || preview.plan.byeCount !== 2 || preview.plan.matchCount !== 13) throw new ApiError(409, "O chaveamento de demonstração não corresponde a 14 classificadas.");
    await confirmBracket({ ...config, orderedIds: preview.orderedIds, signature: preview.signature });
  }
  await prisma.demoRun.updateMany({ where: { eventId, stage: 6 }, data: { stage: 7 } });
}
async function knockoutStep(eventId: string) {
  const run = await prisma.demoRun.findUnique({ where: { eventId } });
  if (run?.stage !== 7) throw new ApiError(409, "Gere o chaveamento antes de simular as eliminatórias.");
  const phase = await prisma.groupPhase.findFirstOrThrow({ where: { eventId } });
  for (let pass = 0; pass < 6; pass++) {
    const bracket = (await bracketContext(eventId, phase.id)).bracket;
    if (!bracket) throw new ApiError(409, "Chaveamento não encontrado.");
    if (bracket.officialMatches === 13) break;
    const pending = bracket.nodes.filter(node => node.match && !node.match.officialAt);
    if (!pending.length) throw new ApiError(409, "Há confrontos eliminatórios ainda sem equipes definidas.");
    for (const node of pending) {
      const match = node.match!;
      if (match.status === "SCHEDULED") await saveBracketScore(eventId, match.id, 12 + node.roundIndex, 7);
      await homologateBracketScore(eventId, match.id);
    }
  }
  const bracket = (await bracketContext(eventId, phase.id)).bracket;
  if (bracket?.officialMatches !== 13 || !bracket.championTeamId) throw new ApiError(409, "A simulação eliminatória não concluiu as 13 partidas.");
  await prisma.demoRun.updateMany({ where: { eventId, stage: 7 }, data: { stage: 8 } });
}
async function championStep(eventId: string) {
  await prisma.$transaction(async tx => {
    await requireStage(tx, eventId, 8);
    const bracket = await tx.bracket.findFirst({ where: { eventId }, include: { nodes: { orderBy: [{ roundIndex: "desc" }, { position: "asc" }], take: 1, include: { match: true } } } });
    const final = bracket?.nodes[0];
    if (!final?.winnerTeamId || !final.match?.officialAt || final.roundIndex !== Math.log2(bracket!.bracketSize) - 1) throw new ApiError(409, "A final ainda não possui campeã homologada.");
    await tx.event.update({ where: { id: eventId }, data: { status: "FINISHED" } });
    await tx.eventPresentation.update({ where: { eventId }, data: { mode: "CHAMPION", revision: { increment: 1 } } });
    await advanceStage(tx, eventId, 8);
  }, serial);
}

export async function runDemoStep(eventId: string, action: DemoAction) {
  const index = demoActions.indexOf(action);
  const run = await prisma.demoRun.findUnique({ where: { eventId }, include: { event: { select: { isDemo: true } } } });
  if (!run?.event.isDemo) throw new ApiError(404, "A simulação só pode alterar um evento fictício.");
  if (run.stage > index) return demoState(eventId);
  if (run.stage !== index) throw new ApiError(409, `Conclua a etapa ${run.stage + 1} antes desta ação.`);
  const steps = [participantsStep, teamsStep, groupsStep, fixturesStep, resultsStep, standingsStep, bracketStep, knockoutStep, championStep];
  await steps[index](eventId);
  return demoState(eventId);
}
