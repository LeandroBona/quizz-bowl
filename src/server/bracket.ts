import { createHash, randomInt, randomUUID } from "node:crypto";
import { Prisma, type Bracket, type GroupPhase } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { calculateStandings, tieBreakerCodes } from "@/lib/group-stage";
import { bracketRoundName, campaignTie, dependentNodePath, planBracket, rankCampaigns, winnerFromOfficial, type Campaign } from "@/lib/bracket";

export const bracketConfigSchema = z.object({ eventId: z.string().min(1), phaseId: z.string().min(1), mode: z.enum(["SEEDED", "RANDOM"]), avoidSameGroup: z.boolean(), tieRule: z.enum(["SCORE", "MANUAL"]), orderedIds: z.array(z.string().min(1)).optional(), acceptCampaignTie: z.boolean().default(false) });
type Config = z.infer<typeof bracketConfigSchema>;
type Tx = Prisma.TransactionClient;
const serial = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 } as const;
function signature(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function shuffle<T>(items: T[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; }
async function requirePhase(tx: Tx, eventId: string, phaseId: string) { const phase = await tx.groupPhase.findFirst({ where: { id: phaseId, eventId } }); if (!phase) throw new ApiError(404, "Fase de grupos não encontrada neste evento."); return phase; }
async function qualifiedCampaigns(tx: Tx, phase: GroupPhase) {
  if (!phase.confirmedAt) throw new ApiError(409, "Confirme a fase de grupos antes de gerar o chaveamento.");
  const groups = await tx.group.findMany({ where: { phaseId: phase.id }, include: { teams: { include: { team: { select: { id: true, name: true } } } }, matches: { orderBy: { id: "asc" } } }, orderBy: { name: "asc" } });
  if (groups.length !== phase.groupCount) throw new ApiError(409, "A quantidade de grupos confirmados não corresponde ao regulamento.");
  const source = groups.map(group => ({ id: group.id, members: group.teams.map(member => [member.teamId, member.manualTieRank]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), matches: group.matches.map(match => [match.id, match.status, match.homeScore, match.awayScore, match.officialAt?.toISOString() ?? null]) }));
  const rules = { winPoints: phase.winPoints, drawPoints: phase.drawPoints, lossPoints: phase.lossPoints, qualifiersPerGroup: phase.qualifiersPerGroup, tieBreakers: z.array(z.enum(tieBreakerCodes)).parse(phase.tieBreakers) };
  const campaigns: Campaign[] = [];
  for (const group of groups) {
    if (group.teams.length < 2 || group.matches.length !== group.teams.length * (group.teams.length - 1) / 2 || group.matches.some(match => !match.officialAt || match.status !== "FINISHED")) throw new ApiError(409, `Homologue todos os confrontos do ${group.name} antes de gerar o mata-mata.`);
    const table = calculateStandings(group.teams.map(member => ({ id: member.teamId, name: member.team.name, manualTieRank: member.manualTieRank })), group.matches, rules);
    if (table.some(row => row.qualification === "PENDING")) throw new ApiError(409, `Resolva o empate na linha de classificação do ${group.name} antes de gerar o mata-mata.`);
    for (const row of table.filter(row => row.qualification === "QUALIFIED")) campaigns.push({ teamId: row.teamId, name: row.name, groupId: group.id, groupName: group.name, groupPosition: row.position, played: row.played, points: row.points, wins: row.wins, diff: row.diff, scored: row.scored });
  }
  if (campaigns.length < 2 || campaigns.length > 32) throw new ApiError(409, "O mata-mata aceita de 2 a 32 equipes classificadas.");
  return { campaigns: rankCampaigns(campaigns), signature: signature({ phase: [phase.id, phase.updatedAt.toISOString(), phase.qualifiersPerGroup, phase.winPoints, phase.drawPoints, phase.lossPoints, phase.tieBreakers], source }) };
}
function orderedCampaigns(ranked: ReturnType<typeof rankCampaigns>, config: Config) {
  const defaultIds = ranked.map(team => team.teamId);
  const ids = config.orderedIds ?? (config.mode === "RANDOM" ? shuffle(defaultIds) : defaultIds);
  if (ids.length !== ranked.length || new Set(ids).size !== ids.length || ids.some(id => !defaultIds.includes(id))) throw new ApiError(400, "A ordem do sorteio deve conter cada classificada uma única vez.");
  const byId = new Map(ranked.map(team => [team.teamId, team]));
  if (config.mode === "SEEDED" && ids.some((id, index) => !campaignTie(ranked[index], byId.get(id)!))) throw new ApiError(400, "No chaveamento por classificação, altere apenas equipes com campanhas rigorosamente empatadas.");
  const byeCount = 2 ** Math.ceil(Math.log2(ranked.length)) - ranked.length;
  const boundaryTie = byeCount > 0 && ranked[byeCount] && campaignTie(ranked[byeCount - 1], ranked[byeCount]);
  return { ordered: ids.map(id => byId.get(id)!), orderedIds: ids, boundaryTie: Boolean(boundaryTie) };
}
export async function previewBracket(config: Config) {
  return prisma.$transaction(async tx => {
    const phase = await requirePhase(tx, config.eventId, config.phaseId);
    const { campaigns, signature: sourceSignature } = await qualifiedCampaigns(tx, phase);
    if (await tx.bracket.findUnique({ where: { phaseId: phase.id } })) throw new ApiError(409, "Esta fase já possui chaveamento.");
    const { ordered, orderedIds, boundaryTie } = orderedCampaigns(campaigns, config);
    return { phase: { id: phase.id, name: phase.name }, campaigns, signature: sourceSignature, orderedIds, boundaryTie, plan: planBracket(ordered, "SEEDED", config.avoidSameGroup) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
async function createMatchForNode(tx: Tx, bracket: Bracket, nodeId: string) {
  const node = await tx.bracketNode.findUniqueOrThrow({ where: { id: nodeId }, include: { slots: { orderBy: { side: "asc" } } } });
  const [home, away] = node.slots;
  if (!home?.teamId || !away?.teamId || node.matchId) return;
  if (home.teamId === away.teamId) throw new ApiError(409, "Uma equipe não pode enfrentar a si mesma.");
  const match = await tx.match.create({ data: { eventId: bracket.eventId, homeTeamId: home.teamId, awayTeamId: away.teamId, round: bracketRoundName(bracket.bracketSize, bracket.teamCount, node.roundIndex), fixtureKey: `bracket:${node.id}:${randomUUID()}` } });
  await tx.bracketNode.update({ where: { id: node.id }, data: { matchId: match.id } });
  await tx.matchEvent.create({ data: { matchId: match.id, kind: "BRACKET_CREATED", details: { bracketId: bracket.id, roundIndex: node.roundIndex, position: node.position } } });
}
async function advance(tx: Tx, bracket: Bracket, nodeId: string, winnerTeamId: string) {
  const target = await tx.bracketSlot.findUnique({ where: { sourceNodeId: nodeId } });
  if (!target) return;
  if (target.teamId && target.teamId !== winnerTeamId) throw new ApiError(409, "A vaga seguinte já pertence a outra equipe. Revogue o avanço anterior.");
  await tx.bracketSlot.update({ where: { id: target.id }, data: { teamId: winnerTeamId } });
  await createMatchForNode(tx, bracket, target.nodeId);
}
export async function confirmBracket(config: Config & { signature: string }) {
  return prisma.$transaction(async tx => {
    const phase = await requirePhase(tx, config.eventId, config.phaseId);
    const { campaigns, signature: actual } = await qualifiedCampaigns(tx, phase);
    if (actual !== config.signature) throw new ApiError(409, "A classificação mudou. Gere uma nova prévia do chaveamento.");
    if (await tx.bracket.findUnique({ where: { phaseId: phase.id } })) throw new ApiError(409, "Esta fase já possui chaveamento.");
    const { ordered, boundaryTie } = orderedCampaigns(campaigns, config);
    if (config.mode === "SEEDED" && boundaryTie && !config.acceptCampaignTie) throw new ApiError(409, "Há empate exato de campanha na linha das vagas diretas. Revise a ordem e confirme explicitamente o critério manual.");
    const plan = planBracket(ordered, "SEEDED", config.avoidSameGroup);
    const bracket = await tx.bracket.create({ data: { eventId: config.eventId, phaseId: phase.id, mode: config.mode, avoidSameGroup: config.avoidSameGroup, tieRule: config.tieRule, teamCount: plan.teamCount, bracketSize: plan.bracketSize } });
    const ids: string[][] = [];
    for (const round of plan.rounds) {
      const nodeIds: string[] = [];
      for (const item of round) {
        const node = await tx.bracketNode.create({ data: { bracketId: bracket.id, roundIndex: item.roundIndex, position: item.position, winnerTeamId: item.byeWinnerId, slots: { create: item.slots.map((slot, side) => ({ bracketId: bracket.id, roundIndex: item.roundIndex, side, teamId: slot.teamId, seed: slot.seed, sourceNodeId: slot.sourcePosition === null ? null : ids[item.roundIndex - 1][slot.sourcePosition] })) } } });
        nodeIds.push(node.id);
      }
      ids.push(nodeIds);
    }
    for (const item of plan.rounds[0]) {
      const nodeId = ids[0][item.position];
      if (item.byeWinnerId) await advance(tx, bracket, nodeId, item.byeWinnerId);
      else await createMatchForNode(tx, bracket, nodeId);
    }
    await tx.bracketEvent.create({ data: { bracketId: bracket.id, kind: "GENERATED", details: { mode: config.mode, orderedIds: ordered.map(team => team.teamId), byes: plan.byeCount, matchCount: plan.matchCount, avoidSameGroup: config.avoidSameGroup, unavoidableSameGroup: plan.unavoidableSameGroup, tieRule: config.tieRule, acceptedCampaignTie: config.acceptCampaignTie } } });
    return bracket;
  }, serial);
}
export async function bracketContext(eventId: string, phaseId?: string) {
  const phases = await prisma.groupPhase.findMany({ where: { eventId }, select: { id: true, name: true, confirmedAt: true }, orderBy: { createdAt: "asc" } });
  const selectedId = phaseId ?? phases.at(-1)?.id;
  if (!selectedId) return { phases, selectedPhaseId: null, readiness: "Configure uma fase de grupos para gerar o mata-mata.", campaigns: [], bracket: null };
  const bracket = await prisma.bracket.findFirst({ where: { eventId, phaseId: selectedId }, include: { phase: { select: { name: true } }, nodes: { include: { slots: { include: { team: { select: { id: true, name: true, color: true } } }, orderBy: { side: "asc" } }, winnerTeam: { select: { id: true, name: true } }, match: { include: { homeTeam: { select: { id: true, name: true } }, awayTeam: { select: { id: true, name: true } }, session: { select: { matchId: true, startedAt: true } } } } }, orderBy: [{ roundIndex: "asc" }, { position: "asc" }] }, events: { orderBy: { createdAt: "desc" }, take: 100 } } });
  if (bracket) {
    const eliminated = bracket.nodes.flatMap(node => node.winnerTeamId && node.slots[0]?.teamId && node.slots[1]?.teamId ? node.slots.map(slot => slot.teamId).filter(id => id && id !== node.winnerTeamId) : []);
    const officialMatches = bracket.nodes.filter(node => node.match?.officialAt).length;
    return { phases, selectedPhaseId: selectedId, readiness: null, campaigns: [], bracket: { ...bracket, eliminatedTeamIds: eliminated, championTeamId: bracket.nodes.at(-1)?.winnerTeamId ?? null, officialMatches, pendingMatches: bracket.teamCount - 1 - officialMatches } };
  }
  try { const data = await prisma.$transaction(async tx => qualifiedCampaigns(tx, await requirePhase(tx, eventId, selectedId))); return { phases, selectedPhaseId: selectedId, readiness: null, campaigns: data.campaigns, bracket: null }; }
  catch (error) { if (error instanceof ApiError) return { phases, selectedPhaseId: selectedId, readiness: error.message, campaigns: [], bracket: null }; throw error; }
}
async function invalidateDependents(tx: Tx, bracket: Bracket, sourceNodeId: string, force: boolean, reason: string) {
  const edges = await tx.bracketSlot.findMany({ where: { bracketId: bracket.id, sourceNodeId: { not: null } }, select: { sourceNodeId: true, nodeId: true } });
  const path = dependentNodePath(sourceNodeId, edges);
  let sourceId = sourceNodeId;
  for (const nodeId of path) {
    const target = await tx.bracketSlot.findUniqueOrThrow({ where: { sourceNodeId: sourceId }, include: { node: { include: { match: { include: { session: true } } } } } });
    const node = target.node;
    if (node.id !== nodeId) throw new ApiError(409, "O caminho do chaveamento mudou durante a correção. Tente novamente.");
    if (node.match && (node.match.status !== "SCHEDULED" || node.match.session?.startedAt) && !force) throw new ApiError(409, "Uma partida dependente já começou ou foi homologada. Confirme a invalidação dos resultados posteriores para corrigir esta partida.");
    if (node.match) {
      await tx.match.update({ where: { id: node.match.id }, data: { status: "CANCELLED", officialAt: null } });
      await tx.matchEvent.create({ data: { matchId: node.match.id, kind: "BRACKET_INVALIDATED", details: { sourceNodeId, reason } } });
    }
    await tx.bracketNode.update({ where: { id: node.id }, data: { matchId: null, winnerTeamId: null, winnerReason: null } });
    await tx.bracketSlot.update({ where: { id: target.id }, data: { teamId: null } });
    sourceId = node.id;
  }
  await tx.bracketEvent.create({ data: { bracketId: bracket.id, kind: "ADVANCE_INVALIDATED", details: { sourceNodeId, reason, force } } });
}
export async function revokeBracketWinner(tx: Tx, matchId: string, force: boolean, reason: string) {
  const node = await tx.bracketNode.findUnique({ where: { matchId }, include: { bracket: true } });
  if (!node || !node.winnerTeamId) return;
  await invalidateDependents(tx, node.bracket, node.id, force, reason);
  await tx.bracketNode.update({ where: { id: node.id }, data: { winnerTeamId: null, winnerReason: null } });
}
export async function homologateBracketWinner(tx: Tx, matchId: string, manualWinnerId?: string | null, reason?: string | null) {
  const node = await tx.bracketNode.findUnique({ where: { matchId }, include: { bracket: true, match: true } });
  if (!node?.match) return;
  const match = node.match;
  if (!match.officialAt) throw new ApiError(409, "Homologue o resultado antes de avançar a equipe.");
  if (node.winnerTeamId) throw new ApiError(409, "Esta partida já possui vencedora confirmada.");
  const winner = winnerFromOfficial(match, node.bracket.tieRule, manualWinnerId);
  if (!winner) throw new ApiError(409, node.bracket.tieRule === "SCORE" ? "Empate no mata-mata: registre pontos adicionais até haver uma vencedora." : "Empate no mata-mata: selecione a vencedora e justifique o desempate manual.");
  if (match.homeScore === match.awayScore && (!reason || reason.trim().length < 5)) throw new ApiError(400, "Justifique o desempate manual com pelo menos cinco caracteres.");
  await tx.bracketNode.update({ where: { id: node.id }, data: { winnerTeamId: winner, winnerReason: match.homeScore === match.awayScore ? reason : null } });
  await tx.bracketEvent.create({ data: { bracketId: node.bracketId, kind: "WINNER_ADVANCED", details: { nodeId: node.id, matchId, winnerTeamId: winner, reason: reason ?? null } } });
  await advance(tx, node.bracket, node.id, winner);
}
export async function swapBracketSlots(eventId: string, bracketId: string, firstSlotId: string, secondSlotId: string) {
  return prisma.$transaction(async tx => {
    const bracket = await tx.bracket.findFirst({ where: { id: bracketId, eventId } });
    if (!bracket) throw new ApiError(404, "Chaveamento não encontrado.");
    const slots = await tx.bracketSlot.findMany({ where: { id: { in: [firstSlotId, secondSlotId] }, bracketId }, include: { node: { include: { match: { include: { session: true } } } } } });
    if (firstSlotId === secondSlotId || slots.length !== 2 || slots[0].nodeId === slots[1].nodeId || slots[0].roundIndex !== slots[1].roundIndex || slots.some(slot => !slot.teamId || slot.node.winnerTeamId || (slot.node.match && (slot.node.match.status !== "SCHEDULED" || slot.node.match.session?.startedAt)))) throw new ApiError(409, "Troque equipes de confrontos diferentes da mesma rodada, antes do início e antes de qualquer avanço.");
    const [a, b] = slots;
    await tx.bracketSlot.update({ where: { id: a.id }, data: { teamId: null, sourceNodeId: null } });
    await tx.bracketSlot.update({ where: { id: b.id }, data: { teamId: a.teamId, sourceNodeId: a.sourceNodeId, seed: a.seed } });
    await tx.bracketSlot.update({ where: { id: a.id }, data: { teamId: b.teamId, sourceNodeId: b.sourceNodeId, seed: b.seed } });
    for (const node of [a.node, b.node]) {
      if (!node.match) continue;
      const pair = await tx.bracketSlot.findMany({ where: { nodeId: node.id }, orderBy: { side: "asc" } });
      await tx.match.update({ where: { id: node.match.id }, data: { homeTeamId: pair[0].teamId!, awayTeamId: pair[1].teamId! } });
      if (node.match.session) await tx.matchSession.update({ where: { matchId: node.match.id }, data: { turnTeamId: pair[0].teamId } });
      await tx.matchEvent.create({ data: { matchId: node.match.id, kind: "BRACKET_SWAP", details: { firstSlotId, secondSlotId, homeTeamId: pair[0].teamId, awayTeamId: pair[1].teamId } } });
    }
    await tx.bracketEvent.create({ data: { bracketId, kind: "SLOTS_SWAPPED", details: { firstSlotId, secondSlotId, teamIds: [a.teamId, b.teamId], roundIndex: a.roundIndex } } });
    return { swapped: true };
  }, serial);
}
async function requireBracketMatch(tx: Tx, eventId: string, matchId: string) {
  const node = await tx.bracketNode.findFirst({ where: { matchId, bracket: { eventId } }, include: { bracket: true, match: { include: { session: true } } } });
  if (!node?.match) throw new ApiError(404, "Partida eliminatória não encontrada neste evento.");
  return node;
}
export async function saveBracketScore(eventId: string, matchId: string, homeScore: number, awayScore: number, force = false, reason?: string) {
  return prisma.$transaction(async tx => {
    const node = await requireBracketMatch(tx, eventId, matchId), match = node.match!;
    if (match.session) throw new ApiError(409, "Use a tela de mediação para alterar o placar desta partida.");
    if (match.status === "LIVE" || match.status === "CANCELLED") throw new ApiError(409, "Esta partida não pode receber placar pelo chaveamento.");
    if (match.officialAt && (!reason || reason.trim().length < 5)) throw new ApiError(400, "Justifique a correção do resultado homologado.");
    if (match.officialAt) await revokeBracketWinner(tx, match.id, force, "Correção de placar anterior");
    const updated = await tx.match.update({ where: { id: matchId }, data: { homeScore, awayScore, status: "FINISHED", officialAt: null } });
    await tx.matchEvent.create({ data: { matchId, kind: "SCORE_CORRECTED", details: { before: { homeScore: match.homeScore, awayScore: match.awayScore, officialAt: match.officialAt?.toISOString() ?? null }, after: { homeScore, awayScore }, reason: reason?.trim() || "Registro inicial do placar" } } });
    return updated;
  }, serial);
}
export async function homologateBracketScore(eventId: string, matchId: string, manualWinnerId?: string | null, reason?: string | null) {
  return prisma.$transaction(async tx => {
    const node = await requireBracketMatch(tx, eventId, matchId), match = node.match!;
    if (match.session) throw new ApiError(409, "Use a tela de mediação para homologar esta partida.");
    if (match.status !== "FINISHED" || match.officialAt) throw new ApiError(409, "Registre um placar pendente antes de homologar.");
    const updated = await tx.match.update({ where: { id: matchId }, data: { officialAt: new Date() } });
    await homologateBracketWinner(tx, matchId, manualWinnerId, reason);
    await tx.matchEvent.create({ data: { matchId, kind: "HOMOLOGATE", details: { homeScore: updated.homeScore, awayScore: updated.awayScore, winnerTeamId: winnerFromOfficial(updated, node.bracket.tieRule, manualWinnerId), reason: reason ?? null } } });
    return updated;
  }, serial);
}
export async function revokeBracketScore(eventId: string, matchId: string, force = false) {
  return prisma.$transaction(async tx => {
    const node = await requireBracketMatch(tx, eventId, matchId), match = node.match!;
    if (match.session) throw new ApiError(409, "Use a tela de mediação para revogar esta partida.");
    if (!match.officialAt) throw new ApiError(409, "Esta partida ainda não foi homologada.");
    await revokeBracketWinner(tx, matchId, force, "Homologação revogada");
    const updated = await tx.match.update({ where: { id: matchId }, data: { officialAt: null } });
    await tx.matchEvent.create({ data: { matchId, kind: "REVOKE", details: { previousOfficialAt: match.officialAt.toISOString(), force } } });
    return updated;
  }, serial);
}
