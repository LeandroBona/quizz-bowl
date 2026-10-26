"use client";
/* eslint-disable @next/next/no-img-element -- URLs cadastradas no evento e nas questões podem incluir imagens externas ou data URL. */
import { useEffect, useRef, useState } from "react";
import { Award, Clock3, Crown, GitBranch, Medal, Radio, Trophy, Volume2, VolumeX } from "lucide-react";

type Team = { id: string; name: string; color: string | null; members?: { name: string; phase: string | null }[] };
type Match = { id: string; status: string; round: string; official: boolean; homeTeam: Team; awayTeam: Team; homeScore?: number; awayScore?: number; position: number | null; turnTeamId: string | null; timer: { state: string; remainingMs: number; serverNow: string } | null };
type Question = { position: number; points: number; statement: string; type: string; alternatives: unknown; difficulty: string; category: string | null; imageUrl: string | null; answer?: string | null; explanation?: string | null };
type Standing = { teamId: string; name: string; position: number; played: number; points: number; diff: number; qualification: string };
type BracketMatch = { id: string; home: string | null; away: string | null; homeTeamId: string | null; awayTeamId: string | null; homeScore: number | null; awayScore: number | null; winnerTeamId: string | null; status: string };
type Snapshot = {
  event: { id: string; name: string; description: string | null; logoUrl: string | null; welcomeMessage: string | null };
  mode: string; revision: number; serverNow: string; soundsEnabled: boolean; appearance: { accentColor: string; backgroundColor: string };
  match?: Match | null; question?: Question | null; effect?: { correct: boolean; teamName: string };
  phaseName?: string | null; groups?: { name: string; standings: Standing[] }[];
  recent?: { id: string; home: string; away: string; homeScore: number; awayScore: number; round: string }[];
  bracket?: { rounds: { name: string; matches: BracketMatch[] }[] } | null;
  champion?: Team | null;
};

const labels: Record<string, string> = { OPENING: "Abertura", TEAMS: "Apresentação das equipes", QUESTION: "Pergunta ao vivo", REVEAL: "Resposta revelada", SCORE: "Placar da partida", STANDINGS: "Classificação geral", BRACKET: "Chaveamento", CHAMPION: "Grande campeã" };
const difficulties: Record<string, string> = { EASY: "Fácil", MEDIUM: "Média", HARD: "Difícil" };
const alphabet = "ABCDEF";
function displayAnswer(value: string | null | undefined) { return value === "TRUE" ? "Verdadeiro" : value === "FALSE" ? "Falso" : value ?? ""; }
function useLive(eventId: string) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const stream = new EventSource(`/api/public/events/${encodeURIComponent(eventId)}/stream`);
    stream.addEventListener("presentation", event => {
      const received = Date.now();
      const snapshot = JSON.parse((event as MessageEvent).data) as Snapshot;
      setOffset(new Date(snapshot.serverNow).getTime() - received);
      setData(snapshot); setConnected(true); setError("");
    });
    stream.onerror = () => { setConnected(false); setError("Reconectando ao evento…"); };
    return () => stream.close();
  }, [eventId]);
  return { data, connected, error, offset };
}
function useClock() { const [now, setNow] = useState(() => Date.now()); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []); return now; }
function ScoreStrip({ match, compact = false }: { match: Match; compact?: boolean }) {
  const home = match.homeScore, away = match.awayScore;
  return <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-5 ${compact ? "rounded-2xl border border-white/15 bg-white/5 px-6 py-4" : "gap-8"}`}>
    <div className="min-w-0 text-right"><span className="block truncate font-bold text-white" style={{ fontSize: compact ? "clamp(1rem,2vw,1.8rem)" : "clamp(1.5rem,3vw,3.5rem)" }}>{match.homeTeam.name}</span>{home !== undefined && away !== undefined && home > away && <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Na liderança</span>}</div>
    <div className={`whitespace-nowrap font-black tabular-nums tracking-tight ${compact ? "text-3xl md:text-5xl" : "text-6xl md:text-[9rem]"}`}>{home === undefined ? "—" : home}<span className="mx-3 text-cyan-400">:</span>{away === undefined ? "—" : away}</div>
    <div className="min-w-0 text-left"><span className="block truncate font-bold text-white" style={{ fontSize: compact ? "clamp(1rem,2vw,1.8rem)" : "clamp(1.5rem,3vw,3.5rem)" }}>{match.awayTeam.name}</span>{home !== undefined && away !== undefined && away > home && <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Na liderança</span>}</div>
  </div>;
}
function TeamCard({ team, side }: { team: Team; side: "left" | "right" }) {
  return <div className={`presentation-enter rounded-[2rem] border border-white/15 bg-white/[.055] p-7 shadow-2xl backdrop-blur ${side === "right" ? "presentation-enter-delay" : ""}`}>
    <div className="mb-6 flex items-center gap-4"><div className="h-16 w-2 rounded-full" style={{ background: team.color ?? "#38bdf8" }}/><div><p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-300">Equipe {side === "left" ? "A" : "B"}</p><h3 className="mt-1 text-3xl font-black md:text-5xl">{team.name}</h3></div></div>
    <div className="space-y-2">{team.members?.length ? team.members.map(member => <div key={`${member.name}-${member.phase}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg"><span className="font-semibold">{member.name}</span><span className="shrink-0 text-sm text-sky-200">{member.phase ?? "Fase não informada"}</span></div>) : <p className="text-slate-300">Integrantes ainda não cadastrados.</p>}</div>
  </div>;
}
function Timer({ match, now, offset }: { match: Match; now: number; offset: number }) {
  const timer = match.timer;
  if (!timer) return null;
  const left = Math.max(0, timer.remainingMs - (timer.state === "RUNNING" ? now + offset - new Date(timer.serverNow).getTime() : 0));
  const seconds = Math.ceil(left / 1000);
  return <div className={`inline-flex min-w-40 items-center justify-center gap-3 rounded-2xl border px-5 py-3 text-4xl font-black tabular-nums ${left <= 0 ? "border-rose-400 bg-rose-500/20 text-rose-200" : seconds <= 10 ? "border-amber-300 bg-amber-400/15 text-amber-200" : "border-cyan-300/40 bg-cyan-400/10 text-white"}`}><Clock3 size={30}/>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</div>;
}
function QuestionScreen({ data, now, offset, reveal }: { data: Snapshot; now: number; offset: number; reveal: boolean }) {
  const question = data.question, match = data.match;
  if (!question || !match) return <EmptyScreen message="Aguardando a próxima pergunta do mediador."/>;
  const alternatives = question.type === "TRUE_FALSE" ? ["Verdadeiro", "Falso"] : Array.isArray(question.alternatives) ? question.alternatives as string[] : [];
  const correct = displayAnswer(question.answer);
  return <div key={`${data.mode}-${question.position}`} className="presentation-enter mx-auto flex w-full max-w-[1600px] flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.28em] text-cyan-300">{match.round} · Questão {question.position}</p><p className="mt-2 text-lg text-slate-300">{difficulties[question.difficulty] ?? question.difficulty} · {question.points} pontos{question.category ? ` · ${question.category}` : ""}</p></div><Timer match={match} now={now} offset={offset}/></div>
    <div className="rounded-[2rem] border border-white/15 bg-white/[.065] px-8 py-8 shadow-2xl md:px-12 md:py-10"><h2 className="text-center font-black leading-tight tracking-tight" style={{ fontSize: "clamp(2rem,3.2vw,4rem)" }}>{question.statement}</h2>{question.imageUrl && <img className="mx-auto mt-6 max-h-[30vh] rounded-xl object-contain" src={question.imageUrl} alt="Imagem da pergunta"/>}</div>
    {alternatives.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{alternatives.map((option, index) => { const letter = alphabet[index]; const highlighted = reveal && (correct === letter || correct === option || (correct === "Verdadeiro" && option === "Verdadeiro") || (correct === "Falso" && option === "Falso")); return <div key={index} className={`flex items-center gap-4 rounded-2xl border px-6 py-4 text-2xl font-semibold transition-all md:text-3xl ${highlighted ? "presentation-correct border-emerald-300 bg-emerald-400/25 text-white shadow-lg shadow-emerald-500/20" : "border-white/15 bg-white/5"}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl font-black ${highlighted ? "bg-emerald-300 text-slate-950" : "bg-cyan-400/15 text-cyan-200"}`}>{letter}</span><span>{option}</span></div>; })}</div> : <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-center text-xl text-slate-300">Resposta curta · avaliação pelo mediador</div>}
    {reveal && correct && <div className="presentation-correct rounded-2xl border border-emerald-300/50 bg-emerald-400/15 px-8 py-5 text-center"><p className="text-sm font-bold uppercase tracking-[.22em] text-emerald-200">Resposta correta</p><p className="mt-2 text-3xl font-black md:text-5xl">{correct}</p>{question.explanation && <p className="mx-auto mt-4 max-w-4xl text-xl text-slate-100">{question.explanation}</p>}{data.effect && <p className={`mt-4 text-xl font-bold ${data.effect.correct ? "text-emerald-200" : "text-rose-200"}`}>{data.effect.teamName}: {data.effect.correct ? "acertou!" : "resposta incorreta"}</p>}</div>}
    {match.homeScore !== undefined && <ScoreStrip match={match} compact/>}
  </div>;
}
function EmptyScreen({ message }: { message: string }) { return <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/15 bg-white/5 p-12 text-center text-3xl font-bold text-slate-200">{message}</div>; }
function StandingsScreen({ data }: { data: Snapshot }) {
  return <div className="grid w-full max-w-[1750px] gap-6 xl:grid-cols-[1fr_350px]"><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{data.groups?.length ? data.groups.map(group => <section key={group.name} className="rounded-2xl border border-white/15 bg-white/5 p-5"><h3 className="mb-4 text-2xl font-black text-cyan-200">{group.name}</h3><div className="space-y-2">{group.standings.map(row => <div key={row.teamId} className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl px-3 py-2 ${row.qualification === "QUALIFIED" ? "bg-emerald-400/15" : "bg-white/5"}`}><span className="font-black text-cyan-200">{row.position}º</span><span className="truncate text-lg font-semibold">{row.name}</span><span className="font-black tabular-nums">{row.points} pts</span></div>)}</div></section>) : <EmptyScreen message="Aguardando grupos confirmados."/>}</div><aside className="rounded-2xl border border-white/15 bg-white/5 p-5"><h3 className="mb-4 text-2xl font-black">Resultados recentes</h3><div className="space-y-3">{data.recent?.length ? data.recent.map(match => <div key={match.id} className="rounded-xl bg-white/5 p-3"><p className="mb-1 text-xs uppercase tracking-wider text-cyan-200">{match.round}</p><p className="flex justify-between gap-3 font-semibold"><span>{match.home} × {match.away}</span><strong className="whitespace-nowrap">{match.homeScore} : {match.awayScore}</strong></p></div>) : <p className="text-slate-300">Sem resultados homologados.</p>}</div></aside></div>;
}
function BracketScreen({ data }: { data: Snapshot }) {
  if (!data.bracket) return <EmptyScreen message="Aguardando o chaveamento eliminatório."/>;
  const rounds = data.bracket.rounds;
  const width = rounds.length * 280;
  const height = Math.max(620, (rounds[0]?.matches.length ?? 1) * 110);
  const y = (roundIndex: number, position: number) => 70 + (position + .5) * (height - 80) / rounds[roundIndex].matches.length;
  return <div className="w-full overflow-auto pb-5"><div className="relative mx-auto" style={{ width, height }}>
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true"><g fill="none" stroke="#38bdf8" strokeOpacity=".52" strokeWidth="2">{rounds.slice(0, -1).flatMap((round, index) => round.matches.map((_, position) => { const startY = y(index, position), endY = y(index + 1, Math.floor(position / 2)), startX = index * 280 + 244, endX = (index + 1) * 280 + 10, middleX = startX + 18; return <path key={`${index}-${position}`} d={`M${startX} ${startY} H${middleX} V${endY} H${endX}`}/>; }))}</g></svg>
    {rounds.map((round, index) => <div key={index}><h3 className="absolute top-1 w-[240px] text-center text-xl font-black uppercase tracking-wider text-cyan-200" style={{ left: index * 280 }}>{round.name}</h3>{round.matches.map((match, position) => <div key={match.id} className="absolute w-[240px] rounded-xl border border-white/20 bg-[#152c4e] p-3 shadow-xl" style={{ left: index * 280, top: y(index, position) - 43 }}><div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${match.winnerTeamId && match.winnerTeamId === match.homeTeamId ? "bg-emerald-400/20" : "bg-white/5"}`}><span className="truncate font-bold">{match.home ?? "A definir"}</span><span className="font-black tabular-nums">{match.homeScore ?? ""}</span></div><div className={`mt-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${match.winnerTeamId && match.winnerTeamId === match.awayTeamId ? "bg-emerald-400/20" : "bg-white/5"}`}><span className="truncate font-bold">{match.away ?? "A definir"}</span><span className="font-black tabular-nums">{match.awayScore ?? ""}</span></div></div>)}</div>)}
  </div></div>;
}
function playCue(mode: string, correct?: boolean) {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const sequence = mode === "CHAMPION" ? [523, 659, 784, 1046] : mode === "REVEAL" ? correct === false ? [330, 247] : [523, 784] : mode === "COUNTDOWN" ? [880] : mode === "QUESTION" ? [440] : [];
  sequence.forEach((frequency, index) => { const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = "sine"; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.0001, context.currentTime + index * .13); gain.gain.exponentialRampToValueAtTime(.11, context.currentTime + index * .13 + .02); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + index * .13 + .21); oscillator.connect(gain).connect(context.destination); oscillator.start(context.currentTime + index * .13); oscillator.stop(context.currentTime + index * .13 + .22); });
  window.setTimeout(() => void context.close(), 1100);
}
export function LivePresentation({ eventId }: { eventId: string }) {
  const { data, connected, error, offset } = useLive(eventId);
  const now = useClock();
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const lastCue = useRef("");
  const lastCountdown = useRef("");
  useEffect(() => { if (!data || !data.soundsEnabled || !soundUnlocked) return; const key = `${data.mode}:${data.revision}:${data.question?.position ?? ""}`; if (lastCue.current === key) return; lastCue.current = key; playCue(data.mode, data.effect?.correct); }, [data, soundUnlocked]);
  useEffect(() => {
    if (!data?.soundsEnabled || !soundUnlocked || data.mode !== "QUESTION" || data.match?.timer?.state !== "RUNNING") return;
    const timer = data.match.timer;
    const left = Math.max(0, timer.remainingMs - (now + offset - new Date(timer.serverNow).getTime()));
    const seconds = Math.ceil(left / 1000);
    const key = `${data.match.id}:${data.question?.position}:${seconds}`;
    if (seconds > 0 && seconds <= 5 && lastCountdown.current !== key) { lastCountdown.current = key; playCue("COUNTDOWN"); }
  }, [data, now, offset, soundUnlocked]);
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#06142e] text-2xl font-bold text-white">{error || "Conectando ao telão…"}</div>;
  const match = data.match;
  return <main className="presentation-theme relative flex min-h-screen flex-col overflow-hidden text-white selection:bg-cyan-400/40" style={{ backgroundColor: data.appearance.backgroundColor, "--presentation-accent": data.appearance.accentColor } as React.CSSProperties}><div className="pointer-events-none absolute -left-40 top-0 h-[50vw] w-[50vw] rounded-full bg-blue-600/15 blur-3xl"/><div className="pointer-events-none absolute -right-32 bottom-0 h-[40vw] w-[40vw] rounded-full bg-cyan-500/10 blur-3xl"/><div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(#fff1 1px,transparent 1px),linear-gradient(90deg,#fff1 1px,transparent 1px)", backgroundSize: "54px 54px" }}/>
    <header className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4 md:px-10"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-slate-950"><Award size={28}/></span><div><p className="text-xs font-bold uppercase tracking-[.26em] text-cyan-300">Quiz Bowl · Ao vivo</p><h1 className="max-w-[50vw] truncate text-lg font-black md:text-2xl">{data.event.name}</h1></div></div><div className="flex items-center gap-4"><span className="hidden text-xs font-bold uppercase tracking-[.18em] text-slate-300 md:block">{labels[data.mode]}</span><span className={`flex items-center gap-2 text-xs ${connected ? "text-emerald-300" : "text-amber-300"}`}><Radio size={15}/>{connected ? "Ao vivo" : "Reconectando"}</span>{data.soundsEnabled && <button className="rounded-full border border-white/20 p-2 text-white" title={soundUnlocked ? "Desativar sons" : "Ativar sons"} aria-label={soundUnlocked ? "Desativar sons" : "Ativar sons"} onClick={() => setSoundUnlocked(value => !value)}>{soundUnlocked ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>}</div></header>
    <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10 md:px-12">{data.mode === "OPENING" && <div key={data.revision} className="presentation-enter mx-auto max-w-6xl text-center">{data.event.logoUrl ? <img src={data.event.logoUrl} alt={`Logo de ${data.event.name}`} className="mx-auto mb-10 max-h-[23vh] max-w-[45vw] object-contain"/> : <div className="mx-auto mb-10 flex h-28 w-28 items-center justify-center rounded-[2rem] border border-cyan-300/50 bg-cyan-400/15 text-cyan-200"><Trophy size={68}/></div>}<p className="mb-5 text-lg font-bold uppercase tracking-[.4em] text-cyan-300">Bem-vindos ao campeonato</p><h2 className="font-black leading-tight tracking-tight" style={{ fontSize: "clamp(3.5rem,7vw,9rem)" }}>{data.event.name}</h2><p className="mx-auto mt-8 max-w-4xl text-2xl text-slate-200 md:text-4xl">{data.event.welcomeMessage || data.event.description || "Conhecimento, estratégia e muita emoção."}</p></div>}
    {data.mode === "TEAMS" && (match ? <div key={`${match.id}-${data.revision}`} className="w-full max-w-[1600px]"><p className="mb-9 text-center text-lg font-bold uppercase tracking-[.28em] text-cyan-300">{match.round} · Conheça as equipes</p><div className="grid gap-7 lg:grid-cols-2"><TeamCard team={match.homeTeam} side="left"/><TeamCard team={match.awayTeam} side="right"/></div></div> : <EmptyScreen message="Selecione uma partida para apresentar as equipes."/>)}
    {(data.mode === "QUESTION" || data.mode === "REVEAL") && <QuestionScreen data={data} now={now} offset={offset} reveal={data.mode === "REVEAL"}/>}
    {data.mode === "SCORE" && (match ? <div key={`${match.id}-${data.revision}`} className="presentation-enter w-full max-w-[1600px] text-center"><p className="mb-8 text-xl font-bold uppercase tracking-[.3em] text-cyan-300">{match.round} · {match.official ? "Resultado oficial" : match.status === "LIVE" ? "Partida em andamento" : "Placar"}</p><ScoreStrip match={match}/><p className="mt-12 text-2xl text-slate-300">{match.position ? `Questão ${match.position}` : "Quiz Bowl"}</p></div> : <EmptyScreen message="Selecione uma partida para exibir o placar."/>)}
    {data.mode === "STANDINGS" && <div className="w-full"><h2 className="mb-7 text-center text-4xl font-black md:text-6xl"><Medal className="mr-4 inline text-cyan-300" size={45}/>Classificação geral</h2><StandingsScreen data={data}/></div>}
    {data.mode === "BRACKET" && <div className="w-full"><h2 className="mb-7 text-center text-4xl font-black md:text-6xl"><GitBranch className="mr-4 inline text-cyan-300" size={45}/>Caminho até a final</h2><BracketScreen data={data}/></div>}
    {data.mode === "CHAMPION" && (data.champion ? <div key={data.revision} className="presentation-enter presentation-champion mx-auto max-w-6xl text-center"><div className="presentation-trophy mx-auto mb-8 flex h-40 w-40 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/15 text-amber-300 shadow-[0_0_80px_#fbbf2455]"><Trophy size={90}/></div><p className="text-xl font-black uppercase tracking-[.4em] text-amber-300">Campeã do Quiz Bowl</p><h2 className="mt-5 font-black tracking-tight" style={{ fontSize: "clamp(4rem,8vw,10rem)" }}>{data.champion.name}</h2><div className="mt-9 flex flex-wrap justify-center gap-3">{data.champion.members?.map(member => <span key={member.name} className="rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-2 text-lg">{member.name}{member.phase ? ` · ${member.phase}` : ""}</span>)}</div><Crown className="mx-auto mt-10 text-amber-300" size={44}/></div> : <EmptyScreen message="Aguardando a homologação da final."/>)}
    </div><footer className="relative z-10 flex justify-between border-t border-white/10 px-6 py-3 text-xs font-bold uppercase tracking-[.22em] text-slate-400 md:px-10"><span>Quiz Bowl · Competição acadêmica</span><span>{error || "Conhecimento em jogo"}</span></footer>
  </main>;
}
