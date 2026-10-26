import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { createPhase,previewGroups,confirmGroups,phaseState } from "../src/server/group-stage";
import { assignMatchQuestions, listMatchQuestions } from "../src/server/match-questions";
import { actionSchema,matchSessionState,performMatchAction } from "../src/server/match-session";
import { publicPresentation, updatePresentation } from "../src/server/presentation";
test("partida completa persiste pontuação, correções, auditoria e classificação oficial",async()=>{const event=await prisma.event.create({data:{name:"Teste de partida"}});try{
  const home=await prisma.team.create({data:{eventId:event.id,name:"Alpha"}}),away=await prisma.team.create({data:{eventId:event.id,name:"Beta"}});
  const phase=await createPhase({eventId:event.id,name:"Grupos",groupCount:1,teamsPerGroup:2,qualifiersPerGroup:1,winPoints:3,drawPoints:1,lossPoints:0,allowDraws:true,tieBreakers:["POINTS","WINS","DIFF","SCORED","HEAD_TO_HEAD","MANUAL"],format:"ROUND_ROBIN_SINGLE"});
  const draw=await previewGroups(event.id,phase.id);await confirmGroups(event.id,phase.id,draw.signature,draw.groups.map(g=>({name:g.name,teamIds:g.teams.map(t=>t.id)})));
  const match=await prisma.match.findFirstOrThrow({where:{eventId:event.id}});
  const q1=await prisma.question.create({data:{eventId:event.id,statement:"Primeira pergunta de teste?",answer:"Resposta A",type:"SHORT_ANSWER",difficulty:"MEDIUM",points:20,timeSeconds:30,isActive:true,status:"READY"}});
  const q2=await prisma.question.create({data:{eventId:event.id,statement:"Segunda pergunta de teste?",answer:"Resposta B",type:"SHORT_ANSWER",difficulty:"EASY",points:10,timeSeconds:20,isActive:true,status:"READY"}});
  await assignMatchQuestions(match.id,event.id,[q1.id,q2.id]);
  await performMatchAction(match.id,{action:"configure",eventId:event.id,mode:"FREE",wrongPenalty:5,defaultDurationSeconds:30},"professor.mediador");
  await performMatchAction(match.id,{action:"start",eventId:event.id});await performMatchAction(match.id,{action:"present",eventId:event.id});
  const publicRows=await listMatchQuestions(match.id,event.id,true);if(publicRows.length!==1||"answer" in publicRows[0].question)throw new Error("API pública de questões expôs o gabarito");
  const publicBefore=await matchSessionState(match.id,event.id,true);if(!publicBefore.question||"answer" in publicBefore.question.question)throw new Error("Gabarito exposto antes da revelação");
  await performMatchAction(match.id,{action:"timer",eventId:event.id,command:"START"});await performMatchAction(match.id,{action:"timer",eventId:event.id,command:"PAUSE"});
  const first=await performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:match.homeTeamId,response:"Inicial",points:0});
  if(!first || !("id" in first))throw new Error("Resposta não criada");
  const second=await performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:match.awayTeamId,response:"Acerto na segunda chance",points:5});
  if(!second || !("id" in second))throw new Error("Segunda resposta não criada");
  await performMatchAction(match.id,{action:"correct",eventId:event.id,answerId:second.id,response:"Revisada",points:0,reason:"Resposta incompleta"});
  await performMatchAction(match.id,{action:"correct",eventId:event.id,answerId:first.id,response:"Inicial revista",points:10,reason:"Revisão da banca"});
  await performMatchAction(match.id,{action:"adjust",eventId:event.id,teamId:match.awayTeamId,delta:2,reason:"Revisão do mediador"});
  const publicStillHidden=await matchSessionState(match.id,event.id,true);if("answer" in publicStillHidden.question!.question)throw new Error("Gabarito exposto após resposta");
  await performMatchAction(match.id,{action:"reveal",eventId:event.id});const publicAfter=await matchSessionState(match.id,event.id,true);if(publicAfter.question?.question.answer!=="Resposta A")throw new Error("Revelação não refletida");
  await performMatchAction(match.id,{action:"present",eventId:event.id});await performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:match.homeTeamId,response:"Resposta B",points:10});
  const before=await phaseState(event.id,phase.id);if(before.groups[0].standings.some(row=>row.qualification==="QUALIFIED"))throw new Error("Classificação antes da homologação");
  await performMatchAction(match.id,{action:"finish",eventId:event.id});const review=await matchSessionState(match.id,event.id);if(review.homeScore!==20||review.awayScore!==2||review.status!=="FINISHED")throw new Error(`Placar incorreto ${review.homeScore}:${review.awayScore}`);
  await performMatchAction(match.id,{action:"homologate",eventId:event.id});const after=await phaseState(event.id,phase.id);if(after.groups[0].standings.filter(row=>row.qualification==="QUALIFIED").length!==1)throw new Error("Classificação não atualizada");
  const altMatch=await prisma.match.create({data:{eventId:event.id,homeTeamId:home.id,awayTeamId:away.id}});
  const q3=await prisma.question.create({data:{eventId:event.id,statement:"Terceira pergunta de teste?",answer:"Sim",type:"SHORT_ANSWER",difficulty:"EASY",points:10,timeSeconds:20,isActive:true,status:"READY"}});
  const q4=await prisma.question.create({data:{eventId:event.id,statement:"Quarta pergunta de teste?",answer:"Não",type:"SHORT_ANSWER",difficulty:"EASY",points:10,timeSeconds:20,isActive:true,status:"READY"}});
  await assignMatchQuestions(altMatch.id,event.id,[q3.id,q4.id]);await performMatchAction(altMatch.id,{action:"configure",eventId:event.id,mode:"ALTERNATING",wrongPenalty:0,defaultDurationSeconds:25});await performMatchAction(altMatch.id,{action:"start",eventId:event.id});await performMatchAction(altMatch.id,{action:"present",eventId:event.id});
  await performMatchAction(altMatch.id,{action:"answer",eventId:event.id,teamId:home.id,response:"Sim",points:10});
  let secondAnswerBlocked=false;try{await performMatchAction(altMatch.id,{action:"answer",eventId:event.id,teamId:away.id,response:"Outra",points:10});}catch{secondAnswerBlocked=true;}if(!secondAnswerBlocked)throw new Error("Questão decidida aceitou resposta da outra equipe");
  await performMatchAction(altMatch.id,{action:"present",eventId:event.id});const altState=await matchSessionState(altMatch.id,event.id);if(!("session" in altState)||altState.session?.turnTeamId!==away.id)throw new Error("Vez alternada incorreta");
  const history=await matchSessionState(match.id,event.id);if(!("events" in history))throw new Error("Histórico administrativo indisponível");if(!history.events.some(row=>row.kind==="CORRECT")||!history.events.some(row=>row.kind==="ADJUST")||!history.events.some(row=>row.kind==="HOMOLOGATE"))throw new Error("Auditoria incompleta");
  if(history.answers.length!==3)throw new Error("Respostas não persistidas");
  if(!history.events.some(row=>row.kind==="CONFIGURE"&&typeof row.details==="object"&&row.details!==null&&"by" in row.details&&row.details.by==="professor.mediador"))throw new Error("Mediador não identificado no histórico");
}finally{await prisma.event.delete({where:{id:event.id}});await prisma.$disconnect();}});

test("campainha, segunda chance, telão e partida única ficam consistentes",async()=>{
  const event=await prisma.event.create({data:{name:"Teste de campainha"}});
  try{
    const home=await prisma.team.create({data:{eventId:event.id,name:"Equipe A"}});
    const away=await prisma.team.create({data:{eventId:event.id,name:"Equipe B"}});
    const match=await prisma.match.create({data:{eventId:event.id,homeTeamId:home.id,awayTeamId:away.id}});
    const nextMatch=await prisma.match.create({data:{eventId:event.id,homeTeamId:away.id,awayTeamId:home.id}});
    const questions=await Promise.all(["Primeira pergunta de teste?","Segunda pergunta de teste?","Terceira pergunta de teste?"].map(statement=>prisma.question.create({data:{eventId:event.id,statement,answer:"Sim",type:"SHORT_ANSWER",difficulty:"HARD",points:30,timeSeconds:30,isActive:true,status:"READY"}})));
    await assignMatchQuestions(match.id,event.id,questions.slice(0,2).map(question=>question.id));
    await assignMatchQuestions(nextMatch.id,event.id,[questions[2].id]);
    await performMatchAction(match.id,{action:"configure",eventId:event.id,mode:"FREE",wrongPenalty:5,defaultDurationSeconds:30});
    await performMatchAction(nextMatch.id,{action:"configure",eventId:event.id,mode:"FREE",wrongPenalty:0,defaultDurationSeconds:30});
    await performMatchAction(match.id,{action:"start",eventId:event.id});
    let screen=await publicPresentation(event.id);
    if(!("match" in screen))throw new Error("Telão sem partida selecionada");
    assert.equal(screen.mode,"SCORE");assert.equal(screen.match?.id,match.id);
    await assert.rejects(()=>performMatchAction(nextMatch.id,{action:"start",eventId:event.id}),/partida em andamento/i);
    await performMatchAction(match.id,{action:"present",eventId:event.id});
    screen=await publicPresentation(event.id);
    assert.equal(screen.mode,"QUESTION");assert.ok(JSON.stringify(screen).includes("Primeira pergunta de teste?"));
    assert.ok(!JSON.stringify(screen).includes("Segunda pergunta de teste?"));
    assert.ok(!JSON.stringify(screen).includes('"answer":"Sim"'));
    assert.equal(actionSchema.safeParse({action:"answer",eventId:event.id,teamId:home.id,points:7}).success,false);
    await assert.rejects(()=>performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:away.id,response:"",points:5}),/primeira resposta/i);
    const first=await performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:away.id,response:"",points:0});
    assert.ok(first&&"id" in first);
    let state=await matchSessionState(match.id,event.id);if(!("answers" in state))throw new Error("Estado administrativo indisponível");
    assert.equal(state.awayScore,0);assert.equal(state.session?.turnTeamId,home.id);assert.equal(state.timer?.state,"IDLE");
    await assert.rejects(()=>performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:home.id,response:"",points:10}),/segunda chance/i);
    const second=await performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:home.id,response:"",points:5});
    assert.ok(second&&"id" in second);
    state=await matchSessionState(match.id,event.id);if(!("answers" in state))throw new Error("Estado administrativo indisponível");
    assert.equal(state.homeScore,5);assert.equal(state.awayScore,0);
    await assert.rejects(()=>performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:away.id,response:"",points:10}),/decidida/i);
    await assert.rejects(()=>performMatchAction(match.id,{action:"correct",eventId:event.id,answerId:first.id,response:"",points:10,reason:"Revisão da banca"}),/remova primeiro/i);
    await performMatchAction(match.id,{action:"correct",eventId:event.id,answerId:second.id,response:"",points:0,reason:"Revisão da banca"});
    await performMatchAction(match.id,{action:"correct",eventId:event.id,answerId:first.id,response:"",points:10,reason:"Revisão da banca"});
    state=await matchSessionState(match.id,event.id);if(!("answers" in state))throw new Error("Estado administrativo indisponível");
    assert.equal(state.awayScore,10);assert.equal(state.homeScore,0);assert.equal(state.events.filter(row=>row.kind==="CORRECT").length,2);
    await performMatchAction(match.id,{action:"reveal",eventId:event.id});
    screen=await publicPresentation(event.id);
    if(!("effect" in screen))throw new Error("Telão sem efeito da resposta");
    assert.equal(screen.mode,"REVEAL");assert.equal(screen.effect?.teamName,"Equipe B");assert.equal(screen.effect?.correct,true);
    await updatePresentation({eventId:event.id,mode:"STANDINGS",matchId:match.id,logoUrl:null,welcomeMessage:null,showQuestionScore:true,showExplanation:false,soundsEnabled:false});
    await performMatchAction(match.id,{action:"present",eventId:event.id});
    screen=await publicPresentation(event.id);assert.equal(screen.mode,"STANDINGS");
    await performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:home.id,response:"",points:10});
    screen=await publicPresentation(event.id);assert.equal(screen.mode,"STANDINGS");
    await assert.rejects(()=>performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:away.id,response:"",points:5}),/decidida/i);
    await performMatchAction(match.id,{action:"reveal",eventId:event.id});
    screen=await publicPresentation(event.id);assert.equal(screen.mode,"STANDINGS");
    await performMatchAction(match.id,{action:"finish",eventId:event.id});
    screen=await publicPresentation(event.id);assert.equal(screen.mode,"STANDINGS");
    await updatePresentation({eventId:event.id,mode:"SCORE",matchId:match.id,logoUrl:null,welcomeMessage:null,showQuestionScore:true,showExplanation:false,soundsEnabled:false});
    screen=await publicPresentation(event.id);assert.equal(screen.mode,"SCORE");
    await performMatchAction(nextMatch.id,{action:"start",eventId:event.id});
    screen=await publicPresentation(event.id);if(!("match" in screen))throw new Error("Telão sem nova partida");assert.equal(screen.match?.id,nextMatch.id);
  }finally{await prisma.event.delete({where:{id:event.id}});await prisma.$disconnect();}
});

test("dois mediadores simultâneos não pontuam as duas equipes na mesma pergunta",async()=>{
  const event=await prisma.event.create({data:{name:"Teste de mediação simultânea"}});
  try{
    const home=await prisma.team.create({data:{eventId:event.id,name:"Casa"}});
    const away=await prisma.team.create({data:{eventId:event.id,name:"Visitante"}});
    const match=await prisma.match.create({data:{eventId:event.id,homeTeamId:home.id,awayTeamId:away.id}});
    const question=await prisma.question.create({data:{eventId:event.id,statement:"Questão para duas janelas?",answer:"Sim",type:"SHORT_ANSWER",difficulty:"EASY",points:10,timeSeconds:30,isActive:true,status:"READY"}});
    await assignMatchQuestions(match.id,event.id,[question.id]);
    await performMatchAction(match.id,{action:"configure",eventId:event.id,mode:"FREE",wrongPenalty:0,defaultDurationSeconds:30});
    await performMatchAction(match.id,{action:"start",eventId:event.id});
    await performMatchAction(match.id,{action:"present",eventId:event.id});
    const results=await Promise.allSettled([
      performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:home.id,response:"",points:10}),
      performMatchAction(match.id,{action:"answer",eventId:event.id,teamId:away.id,response:"",points:10})
    ]);
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    const state=await matchSessionState(match.id,event.id);
    if(!("answers" in state))throw new Error("Estado administrativo indisponível");
    assert.equal(state.answers.length,1);
    assert.equal(state.homeScore+state.awayScore,10);
  }finally{await prisma.event.delete({where:{id:event.id}});await prisma.$disconnect();}
});
