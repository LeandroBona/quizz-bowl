import { Prisma, type GroupPhase } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { calculateStandings, defaultTieBreakers, drawGroups, groupLabel, roundRobin, tieBreakerCodes } from "@/lib/group-stage";

export const phaseSchema = z.object({ eventId: z.string().min(1), name: z.string().trim().min(2).max(100).default("Fase de grupos"), groupCount: z.number().int().min(1).max(100), teamsPerGroup: z.number().int().min(2).max(100).nullable().default(null), qualifiersPerGroup: z.number().int().min(1).max(100), winPoints: z.number().int().min(0).max(1000).default(3), drawPoints: z.number().int().min(0).max(1000).default(1), lossPoints: z.number().int().min(0).max(1000).default(0), allowDraws: z.boolean().default(true), tieBreakers: z.array(z.enum(tieBreakerCodes)).min(1).refine(v => new Set(v).size === v.length, "Critérios duplicados.").default(defaultTieBreakers), format: z.literal("ROUND_ROBIN_SINGLE").default("ROUND_ROBIN_SINGLE") });
export const idSchema = z.object({ eventId: z.string().min(1), phaseId: z.string().min(1) });
const serial = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 } as const;
const maxAutomaticFixtures = 5000;
function rules(phase: GroupPhase) { return { winPoints: phase.winPoints, drawPoints: phase.drawPoints, lossPoints: phase.lossPoints, qualifiersPerGroup: phase.qualifiersPerGroup, tieBreakers: z.array(z.enum(tieBreakerCodes)).parse(phase.tieBreakers) }; }
async function requirePhase(phaseId: string, eventId: string) { const phase = await prisma.groupPhase.findFirst({ where: { id: phaseId, eventId } }); if (!phase) throw new ApiError(404,"Fase não encontrada neste evento."); return phase; }
async function eventTeams(eventId: string) { return prisma.team.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: { name: "asc" } }); }
function checkSize(count: number, phase: Pick<GroupPhase,"groupCount"|"teamsPerGroup"|"qualifiersPerGroup">) { try { drawGroups(Array.from({length:count}, (_,i)=>({id:String(i)})), phase.groupCount, phase.teamsPerGroup, phase.qualifiersPerGroup, () => 0.5); } catch(error) { throw new ApiError(400, error instanceof Error ? error.message : "Configuração inválida."); } }
function fixtureRows(eventId: string, phaseId: string, groupId: string, teamIds: string[]): Prisma.MatchCreateManyInput[] {
  return roundRobin(teamIds).map(fixture => ({
    eventId, groupId, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId,
    round: `Rodada ${fixture.round}`,
    fixtureKey: `${phaseId}:${groupId}:${[fixture.homeTeamId, fixture.awayTeamId].sort().join(":")}`,
  }));
}
function checkFixtureCount(sizes: number[]) {
  const count = sizes.reduce((total, size) => total + size * (size - 1) / 2, 0);
  if (count > maxAutomaticFixtures) throw new ApiError(400, `Esta configuração geraria ${count} partidas. Divida as equipes em mais grupos (limite: ${maxAutomaticFixtures}).`);
  return count;
}
export async function listPhases(eventId: string) { return prisma.groupPhase.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } }); }
export async function createPhase(input: z.infer<typeof phaseSchema>) { if (!await prisma.event.findUnique({where:{id:input.eventId},select:{id:true}})) throw new ApiError(404,"Evento não encontrado."); const teams = await eventTeams(input.eventId); if (teams.length >= 2) checkSize(teams.length,input); return prisma.groupPhase.create({data:{...input,tieBreakers:input.tieBreakers}}); }
export async function updatePhase(phaseId: string, input: z.infer<typeof phaseSchema>) { const phase = await requirePhase(phaseId,input.eventId); if(await prisma.bracket.findUnique({where:{phaseId},select:{id:true}}))throw new ApiError(409,"A fase já originou um chaveamento e seu regulamento está bloqueado."); const teams = await eventTeams(input.eventId); if (phase.confirmedAt && (phase.groupCount!==input.groupCount || phase.teamsPerGroup!==input.teamsPerGroup || phase.qualifiersPerGroup!==input.qualifiersPerGroup || phase.name!==input.name)) throw new ApiError(409,"A estrutura foi confirmada. Crie outra fase para mudar grupos ou classificados."); if (!phase.confirmedAt && teams.length >= 2) checkSize(teams.length,input); if (phase.confirmedAt && !input.allowDraws) { const official=await prisma.match.findMany({where:{group:{phaseId},officialAt:{not:null}},select:{homeScore:true,awayScore:true}}); if(official.some(match=>match.homeScore===match.awayScore)) throw new ApiError(409,"Há resultados empatados homologados. Revogue a homologação antes de proibir empates."); } return prisma.groupPhase.update({where:{id:phaseId},data:{name:input.name,groupCount:input.groupCount,teamsPerGroup:input.teamsPerGroup,qualifiersPerGroup:input.qualifiersPerGroup,winPoints:input.winPoints,drawPoints:input.drawPoints,lossPoints:input.lossPoints,allowDraws:input.allowDraws,tieBreakers:input.tieBreakers,format:input.format}}); }
export async function phaseState(eventId: string, phaseId: string) {
  const phase=await requirePhase(phaseId,eventId);
  const [teams,groups]=await Promise.all([eventTeams(eventId),prisma.group.findMany({where:{phaseId},include:{teams:{include:{team:{select:{id:true,name:true}}}},matches:{include:{homeTeam:{select:{name:true}},awayTeam:{select:{name:true}},session:{select:{matchId:true}}},orderBy:[{round:"asc"},{createdAt:"asc"}]}},orderBy:{name:"asc"}})]);
  return {phase,teams,groups:groups.map(group=>({...group,standings:calculateStandings(group.teams.map(member=>({id:member.team.id,name:member.team.name,manualTieRank:member.manualTieRank})),group.matches,rules(phase))}))};
}
export async function previewGroups(eventId:string,phaseId:string) { const phase=await requirePhase(phaseId,eventId); if(phase.confirmedAt) throw new ApiError(409,"Os grupos já foram confirmados."); const teams=await eventTeams(eventId); checkSize(teams.length,phase); const groups=drawGroups(teams,phase.groupCount,phase.teamsPerGroup,phase.qualifiersPerGroup); return {signature:JSON.stringify({teams:teams.map(x=>[x.id,x.name]),phaseUpdatedAt:phase.updatedAt}),groups:groups.map((members,i)=>({name:`Grupo ${groupLabel(i)}`,teams:members}))}; }
export async function confirmGroups(eventId:string,phaseId:string,signature:string,groups:{name:string;teamIds:string[]}[]) {
  return prisma.$transaction(async tx=>{
    const phase=await tx.groupPhase.findFirst({where:{id:phaseId,eventId}}); if(!phase || phase.confirmedAt) throw new ApiError(409,"Fase indisponível ou já confirmada.");
    const teams=await tx.team.findMany({where:{eventId},select:{id:true,name:true},orderBy:{name:"asc"}});
    const actual=JSON.stringify({teams:teams.map(x=>[x.id,x.name]),phaseUpdatedAt:phase.updatedAt}); if(actual!==signature) throw new ApiError(409,"As equipes ou regras mudaram. Faça um novo sorteio.");
    checkSize(teams.length,phase);
    if(groups.length!==phase.groupCount || groups.some((g,i)=>g.name!==`Grupo ${groupLabel(i)}`)) throw new ApiError(400,"Prévia inválida.");
    const ids=groups.flatMap(g=>g.teamIds); if(ids.length!==teams.length || new Set(ids).size!==ids.length || ids.some(id=>!teams.some(t=>t.id===id))) throw new ApiError(400,"A prévia não contém todas as equipes uma única vez.");
    if(groups.some((g,i)=>g.teamIds.length<phase.qualifiersPerGroup || g.teamIds.length!==(phase.teamsPerGroup??(Math.floor(teams.length/phase.groupCount)+(i<teams.length%phase.groupCount?1:0))))) throw new ApiError(400,"Tamanho dos grupos inválido.");
    const count = checkFixtureCount(groups.map(group => group.teamIds.length));
    await tx.groupPhase.update({where:{id:phaseId},data:{confirmedAt:new Date()}});
    const fixtures: Prisma.MatchCreateManyInput[] = [];
    for(const group of groups) {
      const saved = await tx.group.create({data:{eventId,phaseId,name:group.name,stage:phase.name,teams:{create:group.teamIds.map(teamId=>({teamId,phaseId}))}}});
      fixtures.push(...fixtureRows(eventId, phaseId, saved.id, group.teamIds));
    }
    if (fixtures.length) await tx.match.createMany({ data: fixtures });
    return {confirmed:true, count};
  },serial);
}
export async function swapGroupTeams(eventId:string,phaseId:string,firstTeamId:string,secondTeamId:string) {
  return prisma.$transaction(async tx=>{
    const phase=await tx.groupPhase.findFirst({where:{id:phaseId,eventId}}); if(!phase?.confirmedAt) throw new ApiError(409,"Confirme os grupos antes da troca.");
    if(await tx.bracket.findUnique({where:{phaseId},select:{id:true}})) throw new ApiError(409,"Esta fase já originou um chaveamento. Não é possível alterar os grupos.");
    const members=await tx.groupTeam.findMany({where:{phaseId,teamId:{in:[firstTeamId,secondTeamId]}}}); if(members.length!==2 || firstTeamId===secondTeamId || members[0].groupId===members[1].groupId) throw new ApiError(400,"Selecione equipes de grupos diferentes.");
    const matches=await tx.match.findMany({where:{groupId:{in:members.map(member=>member.groupId)}},include:{session:{select:{matchId:true}},_count:{select:{questionUses:true,answers:true,scores:true}}}});
    if(matches.some(match=>match.status!=="SCHEDULED" || match.officialAt || match.session || match._count.questionUses || match._count.answers || match._count.scores)) throw new ApiError(409,"Há partidas iniciadas, resultados ou questões associadas. A troca de equipes está bloqueada para preservar o histórico.");
    await tx.groupTeam.update({where:{id:members[0].id},data:{groupId:members[1].groupId,manualTieRank:null}});
    await tx.groupTeam.update({where:{id:members[1].id},data:{groupId:members[0].groupId,manualTieRank:null}});
    let updatedMatches = 0;
    for (const match of matches) {
      const homeTeamId = match.homeTeamId === firstTeamId ? secondTeamId : match.homeTeamId === secondTeamId ? firstTeamId : match.homeTeamId;
      const awayTeamId = match.awayTeamId === firstTeamId ? secondTeamId : match.awayTeamId === secondTeamId ? firstTeamId : match.awayTeamId;
      if (homeTeamId === match.homeTeamId && awayTeamId === match.awayTeamId) continue;
      updatedMatches++;
      await tx.match.update({where:{id:match.id},data:{homeTeamId,awayTeamId,fixtureKey:`${phaseId}:${match.groupId}:${[homeTeamId,awayTeamId].sort().join(":")}`}});
      await tx.matchEvent.create({data:{matchId:match.id,kind:"GROUP_TEAM_SWAPPED",details:{before:{homeTeamId:match.homeTeamId,awayTeamId:match.awayTeamId},after:{homeTeamId,awayTeamId},phaseId}}});
    }
    return {swapped:true, updatedMatches};
  },serial);
}
export async function generateFixtures(eventId:string,phaseId:string) {
  return prisma.$transaction(async tx=>{
    const phase=await tx.groupPhase.findFirst({where:{id:phaseId,eventId}}); if(!phase?.confirmedAt) throw new ApiError(409,"Confirme os grupos antes de gerar os confrontos.");
    const groups=await tx.group.findMany({where:{phaseId},include:{teams:true,matches:true}});
    if(groups.some(g=>g.matches.length)) throw new ApiError(409,"Já existem confrontos nesta fase. Nenhum confronto foi duplicado.");
    const count=checkFixtureCount(groups.map(group=>group.teams.length));
    const fixtures=groups.flatMap(group=>fixtureRows(eventId,phaseId,group.id,group.teams.map(team=>team.teamId)));
    if(fixtures.length) await tx.match.createMany({data:fixtures});
    return {count};
  },serial);
}
export async function saveGroupResult(eventId:string,matchId:string,homeScore:number,awayScore:number,reason?:string) {
  return prisma.$transaction(async tx=>{
    const match=await tx.match.findFirst({where:{id:matchId,eventId},include:{group:true,session:true}});
    if(!match?.group?.phaseId)throw new ApiError(404,"Confronto da fase não encontrado.");
    if(await tx.bracket.findUnique({where:{phaseId:match.group.phaseId},select:{id:true}}))throw new ApiError(409,"A fase já originou um chaveamento. Corrigir a classificação de origem exige reconstruir o mata-mata.");
    if(match.session)throw new ApiError(409,"Use a tela da partida para alterar este placar.");
    if(match.status==="FINISHED"&&match.homeScore===homeScore&&match.awayScore===awayScore)return match;
    if(match.status==="FINISHED"&&(!reason||reason.trim().length<5))throw new ApiError(400,"Justifique a correção do resultado com pelo menos cinco caracteres.");
    const phase=await tx.groupPhase.findUnique({where:{id:match.group.phaseId}});
    if(!phase?.allowDraws&&homeScore===awayScore)throw new ApiError(400,"O regulamento não permite empate.");
    const updated=await tx.match.update({where:{id:matchId},data:{homeScore,awayScore,status:"FINISHED",officialAt:null}});
    await tx.matchEvent.create({data:{matchId,kind:match.status==="FINISHED"?"SCORE_CORRECTED":"SCORE_RECORDED",details:{before:{homeScore:match.homeScore,awayScore:match.awayScore,officialAt:match.officialAt?.toISOString()??null},after:{homeScore,awayScore},reason:reason?.trim()??null}}});
    return updated;
  },serial);
}
export async function homologateGroupResult(eventId:string,matchId:string,official:boolean) {
  return prisma.$transaction(async tx=>{
    const match=await tx.match.findFirst({where:{id:matchId,eventId},include:{group:true,session:true}});
    if(!match?.group?.phaseId)throw new ApiError(404,"Confronto da fase não encontrado.");
    if(await tx.bracket.findUnique({where:{phaseId:match.group.phaseId},select:{id:true}}))throw new ApiError(409,"A fase já originou um chaveamento. A classificação de origem está bloqueada.");
    if(match.session)throw new ApiError(409,"Use a tela da partida para homologar este resultado.");
    const phase=await tx.groupPhase.findUnique({where:{id:match.group.phaseId}});
    if(official&&match.status!=="FINISHED")throw new ApiError(409,"Registre o resultado antes de homologar.");
    if(official&&!phase?.allowDraws&&match.homeScore===match.awayScore)throw new ApiError(400,"O regulamento não permite empate.");
    if(Boolean(match.officialAt)===official)return match;
    const updated=await tx.match.update({where:{id:matchId},data:{officialAt:official?new Date():null}});
    await tx.matchEvent.create({data:{matchId,kind:official?"HOMOLOGATE":"REVOKE",details:{homeScore:match.homeScore,awayScore:match.awayScore,previousOfficialAt:match.officialAt?.toISOString()??null}}});
    return updated;
  },serial);
}
export async function setManualTieRank(eventId:string,phaseId:string,groupId:string,teamId:string,rank:number|null) { await requirePhase(phaseId,eventId); if(await prisma.bracket.findUnique({where:{phaseId},select:{id:true}}))throw new ApiError(409,"A fase já originou um chaveamento. A classificação de origem está bloqueada."); const group=await prisma.group.findFirst({where:{id:groupId,phaseId}}); if(!group) throw new ApiError(404,"Grupo não encontrado."); if(rank!==null && await prisma.groupTeam.count({where:{groupId,manualTieRank:rank,teamId:{not:teamId}}})) throw new ApiError(409,"Esta prioridade já foi atribuída a outra equipe do grupo."); const member=await prisma.groupTeam.findFirst({where:{groupId,phaseId,teamId}}); if(!member) throw new ApiError(404,"Equipe não pertence ao grupo."); return prisma.groupTeam.update({where:{id:member.id},data:{manualTieRank:rank}}); }
