export type MatchMode = "ALTERNATING" | "FREE";
export type MatchOutcome = { homeScore:number; awayScore:number; winnerTeamId:string|null; draw:boolean };
export function pointsForResponse(input:{correct:boolean;questionPoints:number;wrongPenalty:number;partialPoints?:number|null}) {
  if (!Number.isInteger(input.questionPoints)||input.questionPoints<0||!Number.isInteger(input.wrongPenalty)||input.wrongPenalty<0) throw new Error("Regras de pontuação inválidas.");
  if(input.partialPoints!==undefined&&input.partialPoints!==null){if(!Number.isInteger(input.partialPoints)||input.partialPoints<0||input.partialPoints>input.questionPoints)throw new Error("A pontuação parcial deve ficar entre zero e o valor da questão.");return input.partialPoints;}
  return input.correct?input.questionPoints:input.wrongPenalty===0?0:-input.wrongPenalty;
}
export function remainingTimerMs(timer:{timerState:"IDLE"|"RUNNING"|"PAUSED";timerRemainingMs:number;timerStartedAt:Date|string|null},now:Date|string|number){
  if(timer.timerState!=="RUNNING"||!timer.timerStartedAt)return Math.max(0,timer.timerRemainingMs);
  return Math.max(0,timer.timerRemainingMs-(new Date(now).getTime()-new Date(timer.timerStartedAt).getTime()));
}
export function matchOutcome(homeTeamId:string,awayTeamId:string,homeScore:number,awayScore:number):MatchOutcome {
  return {homeScore,awayScore,winnerTeamId:homeScore===awayScore?null:homeScore>awayScore?homeTeamId:awayTeamId,draw:homeScore===awayScore};
}
export function nextAlternatingTurn(homeTeamId:string,awayTeamId:string,currentTeamId:string|null){return currentTeamId===homeTeamId?awayTeamId:homeTeamId;}
