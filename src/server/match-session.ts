import { randomInt } from "node:crypto";
import { Prisma, type Match, type MatchSession } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { knockoutNextQuestion, matchOutcome, nextAlternatingTurn, remainingTimerMs } from "@/lib/match-engine";
import { buzzerState, orderBuzzerAnswers, validateBuzzerAward, validateBuzzerCorrection } from "@/lib/buzzer-scoring";
import { publicQuestion } from "@/lib/question-public";
import { homologateBracketWinner, revokeBracketWinner } from "@/server/bracket";

const id=z.string().min(1);
const reason=z.string().trim().min(5).max(500);
const fixedPoints=z.union([z.literal(0),z.literal(5),z.literal(10),z.literal(15),z.literal(20)]);
export const actionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("configure"),eventId:id,mode:z.enum(["ALTERNATING","FREE"]),wrongPenalty:z.number().int().min(0).max(1000),defaultDurationSeconds:z.number().int().min(5).max(3600)}),
  z.object({action:z.literal("start"),eventId:id}),
  z.object({action:z.literal("present"),eventId:id}),
  z.object({action:z.literal("turn"),eventId:id,teamId:id}),
  z.object({action:z.literal("timer"),eventId:id,command:z.enum(["START","PAUSE","RESET"]),seconds:z.number().int().min(5).max(3600).optional()}),
  z.object({action:z.literal("answer"),eventId:id,teamId:id,response:z.string().trim().max(5000).default(""),points:fixedPoints}),
  z.object({action:z.literal("correct"),eventId:id,answerId:id,response:z.string().trim().max(5000).default(""),points:fixedPoints,reason}),
  z.object({action:z.literal("setScore"),eventId:id,homeScore:z.number().int().min(0).max(100000),awayScore:z.number().int().min(0).max(100000),reason,invalidateDependents:z.boolean().default(false)}),
  z.object({action:z.literal("adjust"),eventId:id,teamId:id,delta:z.number().int().min(-1000).max(1000).refine(v=>v!==0),reason}),
  z.object({action:z.literal("reveal"),eventId:id}),
  z.object({action:z.literal("finish"),eventId:id}),
  z.object({action:z.literal("homologate"),eventId:id,manualWinnerId:id.optional(),reason:reason.optional()}),
  z.object({action:z.literal("revoke"),eventId:id,invalidateDependents:z.boolean().default(false)})
]);
export type MatchAction=z.infer<typeof actionSchema>;
type Tx=Prisma.TransactionClient;
const serial={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000} as const;
async function writeMatchEvent(tx:Tx,matchId:string,kind:string,details:Prisma.InputJsonValue){await tx.matchEvent.create({data:{matchId,kind,details}});}
async function requireMatch(tx:Tx,matchId:string,eventId:string){const match=await tx.match.findFirst({where:{id:matchId,eventId},include:{group:{include:{phase:true}}}});if(!match)throw new ApiError(404,"Partida não encontrada neste evento.");return match;}
function assertTeam(match:Match,teamId:string){if(teamId!==match.homeTeamId&&teamId!==match.awayTeamId)throw new ApiError(400,"Equipe não participa desta partida.");}
function mutable(match:Match){if(match.status!=="LIVE"&&match.status!=="FINISHED")throw new ApiError(409,"Inicie a partida antes de registrar pontos.");if(match.officialAt)throw new ApiError(409,"Revogue a homologação antes de alterar o resultado.");}
async function lockSession(tx:Tx,matchId:string){try{await tx.matchSession.update({where:{matchId},data:{revision:{increment:1}}});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2025")throw new ApiError(409,"Configure a partida antes de iniciar.");throw error;}return tx.matchSession.findUniqueOrThrow({where:{matchId}});}
async function currentAssignment(tx:Tx,matchId:string,session:MatchSession){if(!session.currentPosition)throw new ApiError(409,"Apresente uma questão primeiro.");const assignment=await tx.questionUse.findFirst({where:{matchId,position:session.currentPosition},include:{question:true}});if(!assignment)throw new ApiError(409,"Questão atual não encontrada.");return assignment;}
async function addPoints(tx:Tx,match:Match,teamId:string,delta:number,reasonText:string){if(!delta)return;await tx.score.create({data:{matchId:match.id,teamId,points:delta,reason:reasonText}});await tx.match.update({where:{id:match.id},data:teamId===match.homeTeamId?{homeScore:{increment:delta}}:{awayScore:{increment:delta}}});}
async function showMatchOnScreen(tx:Tx,eventId:string,matchId:string,mode:"SCORE"|"QUESTION"|"REVEAL",force=false){
  if(!force){
    const current=await tx.eventPresentation.findUnique({where:{eventId},select:{mode:true}});
    if(current&&!(["SCORE","QUESTION","REVEAL"] as string[]).includes(current.mode))return;
  }
  await tx.eventPresentation.upsert({where:{eventId},create:{eventId,matchId,mode},update:{matchId,mode,revision:{increment:1}}});
}
export async function matchSessionState(matchId:string,eventId:string,publicView=false){
  const match=await prisma.match.findFirst({
    where:{id:matchId,eventId},
    include:{
      homeTeam:{select:{id:true,name:true,color:true}},
      awayTeam:{select:{id:true,name:true,color:true}},
      group:{select:{id:true,name:true}},
      session:true,
      bracketNode:{include:{bracket:{select:{id:true,tieRule:true,mode:true}}}},
      questionUses:{include:{question:true},orderBy:{position:"asc"}},
      answers:{include:{team:{select:{id:true,name:true}},assignment:{select:{position:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}]},
      scores:{include:{team:{select:{name:true}}},orderBy:{createdAt:"asc"}},
      events:{orderBy:{createdAt:"desc"},take:100}
    }
  });
  if(!match)throw new ApiError(404,"Partida não encontrada neste evento.");
  const serverNow=new Date();const timer=match.session?{state:match.session.timerState,remainingMs:remainingTimerMs(match.session,serverNow),startedAt:match.session.timerStartedAt,serverNow}:null;
  if(publicView){const assignment=match.status==="LIVE"&&match.session?.currentPosition?match.questionUses.find(item=>item.position===match.session?.currentPosition):null;return {id:match.id,status:match.status,officialAt:match.officialAt,homeTeam:match.homeTeam,awayTeam:match.awayTeam,homeScore:match.homeScore,awayScore:match.awayScore,group:match.group,round:match.round,position:match.session?.currentPosition??null,totalQuestions:match.questionUses.length,turnTeamId:match.session?.turnTeamId??null,mode:match.session?.mode??null,timer,question:assignment?publicQuestion(assignment):null,serverNow};}
  const defaults=await prisma.eventSettings.findUnique({where:{eventId},select:{questionsPerMatch:true,responseSeconds:true,wrongPenalty:true}});
  const answerEvents=await prisma.matchEvent.findMany({where:{matchId,kind:"ANSWER"},select:{details:true}});
  return {...match,answers:orderBuzzerAnswers(match.answers,answerEvents),timer,serverNow,defaults};
}
export async function performMatchAction(matchId:string,input:MatchAction,actorUsername?:string){
  const record=(tx:Tx,id:string,kind:string,details:Prisma.InputJsonValue)=>writeMatchEvent(tx,id,kind,actorUsername?{...(details as Record<string,Prisma.InputJsonValue>),by:actorUsername}:details);
  return prisma.$transaction(async tx=>{
    const match=await requireMatch(tx,matchId,input.eventId);const now=new Date();
    if(input.action==="configure"){
      if(match.status!=="SCHEDULED")throw new ApiError(409,"As regras só podem ser configuradas antes do início.");
      const session=await tx.matchSession.upsert({where:{matchId},create:{matchId,mode:input.mode,wrongPenalty:input.wrongPenalty,defaultDurationSeconds:input.defaultDurationSeconds,timerRemainingMs:input.defaultDurationSeconds*1000,turnTeamId:match.homeTeamId},update:{mode:input.mode,wrongPenalty:input.wrongPenalty,defaultDurationSeconds:input.defaultDurationSeconds,timerRemainingMs:input.defaultDurationSeconds*1000,revision:{increment:1}}});
      await record(tx,matchId,"CONFIGURE",{mode:session.mode,wrongPenalty:session.wrongPenalty,defaultDurationSeconds:session.defaultDurationSeconds});return session;
    }
    const session=await lockSession(tx,matchId);
    if(input.action==="start"){
      if(match.status!=="SCHEDULED")throw new ApiError(409,"A partida já foi iniciada ou encerrada.");
      await tx.event.update({where:{id:match.eventId},data:{updatedAt:now}});
      if(await tx.match.count({where:{eventId:match.eventId,status:"LIVE",id:{not:matchId}}}))throw new ApiError(409,"Já existe uma partida em andamento neste evento. Encerre-a antes de iniciar outra.");
      const questionCount=await tx.questionUse.count({where:{matchId}});
      if(await tx.bracketNode.count({where:{matchId}})) {
        if(questionCount!==10)throw new ApiError(409,"Partidas do mata-mata precisam de 10 questões iniciais. Complete o roteiro antes de iniciar.");
      } else if(!questionCount)throw new ApiError(409,"Associe pelo menos uma questão antes de iniciar.");
      if(!await tx.score.count({where:{matchId}})){if(match.homeScore)await tx.score.create({data:{matchId,teamId:match.homeTeamId,points:match.homeScore,reason:"Placar inicial"}});if(match.awayScore)await tx.score.create({data:{matchId,teamId:match.awayTeamId,points:match.awayScore,reason:"Placar inicial"}});}
      await tx.match.update({where:{id:matchId},data:{status:"LIVE",officialAt:null}});await tx.matchSession.update({where:{matchId},data:{startedAt:now,turnTeamId:match.homeTeamId}});await showMatchOnScreen(tx,match.eventId,matchId,"SCORE",true);await record(tx,matchId,"START",{at:now.toISOString()});return {started:true};
    }
    if(input.action==="present"){
      if(match.status!=="LIVE")throw new ApiError(409,"A partida precisa estar em andamento.");
      const knockout=await tx.bracketNode.count({where:{matchId}})>0;
      let next=await tx.questionUse.findFirst({where:{matchId,position:{gt:session.currentPosition??0}},orderBy:{position:"asc"},select:{id:true,position:true,question:{select:{timeSeconds:true}}}});
      if(knockout){
        const step=knockoutNextQuestion(session.currentPosition??0,Boolean(next),match.homeScore===match.awayScore);
        if(step==="COMPLETE")throw new ApiError(409,"O desempate só abre uma questão extra quando o placar está empatado.");
        if(step==="MISSING"||step==="EXTRA"){
          const settings=await tx.questionSettings.findUnique({where:{eventId:match.eventId}});
          const used=await tx.questionUse.findMany({where:{matchId},select:{questionId:true}});
          const candidates=await tx.question.findMany({where:{isActive:true,OR:[{eventId:match.eventId},{eventId:null}],id:{notIn:used.map(row=>row.questionId)},...(settings?.noRepeat!==false?{uses:{none:{eventId:match.eventId}},reservations:{none:{eventId:match.eventId}}}:{})},select:{id:true,difficulty:true,timeSeconds:true}});
          if(!candidates.length)throw new ApiError(409,step==="EXTRA"?"Não há questão inédita disponível para o desempate. Cadastre mais questões antes de continuar.":"Não há questão inédita para completar as 10 perguntas do mata-mata. Cadastre mais questões antes de continuar.");
          const question=candidates[randomInt(candidates.length)];
          if(settings?.noRepeat!==false)await tx.eventQuestionReservation.create({data:{eventId:match.eventId,questionId:question.id}});
          const points=settings?.pointsMode==="FIXED"?settings.fixedPoints:question.difficulty==="EASY"?settings?.easyPoints??10:question.difficulty==="HARD"?settings?.hardPoints??30:settings?.mediumPoints??20;
          next=await tx.questionUse.create({data:{eventId:match.eventId,matchId,questionId:question.id,position:(session.currentPosition??0)+1,awardedPoints:points},select:{id:true,position:true,question:{select:{timeSeconds:true}}}});
          await record(tx,matchId,step==="EXTRA"?"EXTRA_QUESTION":"QUESTION_ADDED",{position:next.position,questionId:question.id});
        }
      }
      if(!next)throw new ApiError(409,"Não há mais questões para apresentar.");
      const duration=session.defaultDurationSeconds;
      const turn=session.mode==="ALTERNATING"&&session.currentPosition?nextAlternatingTurn(match.homeTeamId,match.awayTeamId,session.turnTeamId):session.turnTeamId||match.homeTeamId;
      await tx.matchSession.update({where:{matchId},data:{currentPosition:next.position,turnTeamId:turn,timerState:"IDLE",timerRemainingMs:duration*1000,timerStartedAt:null}});await showMatchOnScreen(tx,match.eventId,matchId,"QUESTION");await record(tx,matchId,"PRESENT",{position:next.position,assignmentId:next.id,turnTeamId:turn,durationSeconds:duration});return {position:next.position};
    }
    if(input.action==="turn"){
      if(match.status!=="LIVE")throw new ApiError(409,"A partida precisa estar em andamento.");assertTeam(match,input.teamId);await tx.matchSession.update({where:{matchId},data:{turnTeamId:input.teamId}});await record(tx,matchId,"TURN",{from:session.turnTeamId,to:input.teamId});return {turnTeamId:input.teamId};
    }
    if(input.action==="timer"){
      if(match.status!=="LIVE"||!session.currentPosition)throw new ApiError(409,"Apresente uma questão antes de controlar o cronômetro.");
      const remaining=remainingTimerMs(session,now);
      if(input.command==="START"){if(session.timerState==="RUNNING")throw new ApiError(409,"O cronômetro já está em andamento.");if(remaining<=0)throw new ApiError(409,"Reinicie o cronômetro para iniciar outro período.");await tx.matchSession.update({where:{matchId},data:{timerState:"RUNNING",timerRemainingMs:remaining,timerStartedAt:now}});}
      if(input.command==="PAUSE"){if(session.timerState!=="RUNNING")throw new ApiError(409,"O cronômetro não está em andamento.");await tx.matchSession.update({where:{matchId},data:{timerState:"PAUSED",timerRemainingMs:remaining,timerStartedAt:null}});}
      if(input.command==="RESET"){const seconds=input.seconds??session.defaultDurationSeconds;await tx.matchSession.update({where:{matchId},data:{timerState:"IDLE",timerRemainingMs:seconds*1000,timerStartedAt:null}});}
      await record(tx,matchId,"TIMER",{command:input.command,remainingMs:input.command==="RESET"?(input.seconds??session.defaultDurationSeconds)*1000:remaining,at:now.toISOString()});return {timer:true};
    }
    if(input.action==="answer"){
      if(match.status!=="LIVE")throw new ApiError(409,"A partida precisa estar em andamento.");assertTeam(match,input.teamId);
      const assignment=await currentAssignment(tx,matchId,session);
      const rows=await tx.answer.findMany({where:{assignmentId:assignment.id},select:{id:true,teamId:true,points:true,createdAt:true,assignmentId:true}});
      const answerEvents=await tx.matchEvent.findMany({where:{matchId,kind:"ANSWER"},select:{details:true}});
      const previous=orderBuzzerAnswers(rows,answerEvents);
      const format=await tx.bracketNode.count({where:{matchId}})>0?"KNOCKOUT":"GROUP";
      let stage: ReturnType<typeof validateBuzzerAward>;
      try{stage=validateBuzzerAward(match.homeTeamId,match.awayTeamId,previous,input.teamId,input.points,format);}catch(error){throw new ApiError(409,error instanceof Error?error.message:"Pontuação inválida.");}
      const points=input.points,correct=points>0;
      let answer;
      try {
        answer=await tx.answer.create({data:{matchId,questionId:assignment.questionId,assignmentId:assignment.id,teamId:input.teamId,response:input.response,isCorrect:correct,points}});
      } catch (error) {
        if(stage.stage==="REPLY"&&error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")throw new ApiError(409,"A tréplica exige a migração do banco. Execute npm run db:deploy na VPS e reinicie o servidor.");
        throw error;
      }
      await addPoints(tx,match,input.teamId,points,`Questão ${assignment.position}: ${points} pontos`);
      const nextState=buzzerState(match.homeTeamId,match.awayTeamId,[...previous,{teamId:input.teamId,points}],format);
      const nextTeamId=nextState.eligibleTeamIds[0]??input.teamId;
      await tx.matchSession.update({where:{matchId},data:{turnTeamId:nextTeamId,timerState:nextState.stage==="DONE"?"PAUSED":"IDLE",timerRemainingMs:nextState.stage==="DONE"?remainingTimerMs(session,now):session.defaultDurationSeconds*1000,timerStartedAt:null}});
      if(nextState.stage!=="DONE")await record(tx,matchId,nextState.stage,{position:assignment.position,nextTeamId});
      await record(tx,matchId,"ANSWER",{answerId:answer.id,position:assignment.position,teamId:input.teamId,response:input.response,correct,points,buzzerStage:stage.stage});return answer;
    }
    if(input.action==="correct"){
      mutable(match);const answer=await tx.answer.findFirst({where:{id:input.answerId,matchId},include:{assignment:true}});if(!answer?.assignment)throw new ApiError(404,"Resposta não encontrada na partida.");
      const siblingRows=await tx.answer.findMany({where:{assignmentId:answer.assignment.id},select:{id:true,teamId:true,points:true,createdAt:true}});
      const answerEvents=await tx.matchEvent.findMany({where:{matchId,kind:"ANSWER"},select:{details:true}});
      const siblings=orderBuzzerAnswers(siblingRows,answerEvents);
      const format=await tx.bracketNode.count({where:{matchId}})>0?"KNOCKOUT":"GROUP";
      try{validateBuzzerCorrection(siblings,answer.id,input.points,format);}catch(error){throw new ApiError(409,error instanceof Error?error.message:"Correção inválida.");}
      const points=input.points,correct=points>0;
      const delta=points-answer.points;const before={response:answer.response,correct:answer.isCorrect,points:answer.points};
      await tx.answer.update({where:{id:answer.id},data:{response:input.response,isCorrect:correct,points}});if(delta)await addPoints(tx,match,answer.teamId,delta,`Correção da questão ${answer.assignment.position}: ${input.reason}`);
      await record(tx,matchId,"CORRECT",{answerId:answer.id,before,after:{response:input.response,correct,points},delta,reason:input.reason});return {delta};
    }
    if(input.action==="setScore"){
      if(match.status!=="LIVE"&&match.status!=="FINISHED")throw new ApiError(409,"Inicie a partida antes de corrigir o placar.");
      if(match.group?.phaseId&&await tx.bracket.findUnique({where:{phaseId:match.group.phaseId},select:{id:true}}))throw new ApiError(409,"A fase de grupos já originou um chaveamento. Revise o mata-mata antes de corrigir esta classificação.");
      if(match.officialAt){
        await revokeBracketWinner(tx,matchId,input.invalidateDependents,`Placar corrigido: ${input.reason}`);
        await tx.match.update({where:{id:matchId},data:{officialAt:null}});
        await record(tx,matchId,"REVOKE",{previousOfficialAt:match.officialAt.toISOString(),invalidateDependents:input.invalidateDependents,reason:input.reason});
      }
      const homeDelta=input.homeScore-match.homeScore,awayDelta=input.awayScore-match.awayScore;
      await addPoints(tx,match,match.homeTeamId,homeDelta,`Correção de placar: ${input.reason}`);
      await addPoints(tx,match,match.awayTeamId,awayDelta,`Correção de placar: ${input.reason}`);
      await record(tx,matchId,"SCORE_CORRECTED",{before:{homeScore:match.homeScore,awayScore:match.awayScore,officialAt:match.officialAt?.toISOString()??null},after:{homeScore:input.homeScore,awayScore:input.awayScore},reason:input.reason});
      return {homeScore:input.homeScore,awayScore:input.awayScore,officialAt:null};
    }
    if(input.action==="adjust"){
      mutable(match);assertTeam(match,input.teamId);await addPoints(tx,match,input.teamId,input.delta,`Ajuste manual: ${input.reason}`);await record(tx,matchId,"ADJUST",{teamId:input.teamId,delta:input.delta,reason:input.reason});return {delta:input.delta};
    }
    if(input.action==="reveal"){
      if(match.status!=="LIVE")throw new ApiError(409,"A partida precisa estar em andamento.");const assignment=await currentAssignment(tx,matchId,session);if(assignment.status==="REVEALED")throw new ApiError(409,"Resposta já revelada.");await tx.questionUse.update({where:{id:assignment.id},data:{status:"REVEALED",revealedAt:now}});await showMatchOnScreen(tx,match.eventId,matchId,"REVEAL");await record(tx,matchId,"REVEAL",{position:assignment.position,assignmentId:assignment.id});return {revealed:true};
    }
    if(input.action==="finish"){
      if(match.status!=="LIVE")throw new ApiError(409,"Somente partida em andamento pode ser encerrada.");
      if(await tx.bracketNode.count({where:{matchId}})>0){
        if((session.currentPosition??0)<10)throw new ApiError(409,"Apresente as 10 questões do mata-mata antes de encerrar.");
        if(match.homeScore===match.awayScore)throw new ApiError(409,"Placar empatado. Apresente uma questão extra para o desempate.");
      }
      const remaining=remainingTimerMs(session,now);await tx.matchSession.update({where:{matchId},data:{endedAt:now,timerState:"PAUSED",timerRemainingMs:remaining,timerStartedAt:null}});await tx.match.update({where:{id:matchId},data:{status:"FINISHED",officialAt:null}});await showMatchOnScreen(tx,match.eventId,matchId,"SCORE");await record(tx,matchId,"FINISH",{...matchOutcome(match.homeTeamId,match.awayTeamId,match.homeScore,match.awayScore),at:now.toISOString()});return {finished:true};
    }
    if(input.action==="homologate"){
      if(match.status!=="FINISHED"||!session.endedAt)throw new ApiError(409,"Encerre a partida antes de homologar.");if(match.officialAt)throw new ApiError(409,"Resultado já homologado.");if(match.group?.phase&&!match.group.phase.allowDraws&&match.homeScore===match.awayScore)throw new ApiError(409,"O regulamento do grupo não permite empate. Ajuste o resultado antes de homologar.");
      await tx.match.update({where:{id:matchId},data:{officialAt:now}});await homologateBracketWinner(tx,matchId,input.manualWinnerId,input.reason);await record(tx,matchId,"HOMOLOGATE",{...matchOutcome(match.homeTeamId,match.awayTeamId,match.homeScore,match.awayScore),manualWinnerId:input.manualWinnerId??null,reason:input.reason??null,at:now.toISOString()});return {officialAt:now};
    }
    if(input.action==="revoke"){
      if(!match.officialAt)throw new ApiError(409,"Resultado ainda não homologado.");if(match.group?.phaseId&&await tx.bracket.findUnique({where:{phaseId:match.group.phaseId},select:{id:true}}))throw new ApiError(409,"Esta fase já possui chaveamento. A classificação de origem deve permanecer homologada.");await revokeBracketWinner(tx,matchId,input.invalidateDependents,"Homologação revogada na mediação");await tx.match.update({where:{id:matchId},data:{officialAt:null}});await record(tx,matchId,"REVOKE",{previousOfficialAt:match.officialAt.toISOString(),invalidateDependents:input.invalidateDependents});return {revoked:true};
    }
  },serial);
}
