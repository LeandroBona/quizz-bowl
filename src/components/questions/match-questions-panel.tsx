"use client";
/* eslint-disable @next/next/no-img-element -- A imagem da questão pode ser data URL ou URL HTTPS fornecida pelo administrador. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Clock3, Eye, MonitorPlay, RefreshCw, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { responseJson } from "@/lib/api-client";

type Match = { id: string; status: string; session: { matchId: string } | null; homeTeam: { name: string }; awayTeam: { name: string }; round: string | null };
type Assignment = { id: string; position: number; awardedPoints: number; status: "ASSIGNED" | "REVEALED"; question: { statement: string; type: string; alternatives: string[] | null; answer: string; explanation: string | null; category: string | null; difficulty: string; timeSeconds: number; imageUrl: string | null } };
const difficultyNames: Record<string, string> = { EASY: "Fácil", MEDIUM: "Média", HARD: "Difícil" };
export function MatchQuestionsPanel({ eventId, categories, onChanged }: { eventId: string; categories: string[]; onChanged: () => Promise<void> }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadMatches = useCallback(async () => {
    try {
      const rows: Match[] = await responseJson(await fetch(`/api/matches?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" }));
      setMatches(rows); setMatchId(current => rows.some(match => match.id === current) ? current : rows[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar as partidas."); }
  }, [eventId]);
  const loadAssignments = useCallback(async () => {
    if (!matchId) { setAssignments([]); return; }
    try { setAssignments(await responseJson(await fetch(`/api/matches/${matchId}/questions/admin?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" }))); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar as questões da partida."); }
  }, [matchId, eventId]);
  useEffect(() => { void loadMatches(); }, [loadMatches]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);
  async function draw() {
    if (!matchId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const created: Assignment[] = await responseJson(await fetch(`/api/matches/${matchId}/questions/draw`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, category, difficulty, count }) }));
      setNotice(`${created.length} questão(ões) associada(s) à partida.`);
      await loadAssignments(); await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível sortear as questões."); }
    finally { setBusy(false); }
  }
  async function reveal(assignment: Assignment) {
    if (!matchId || !window.confirm(`Revelar a resposta da questão ${assignment.position} no telão?`)) return;
    setBusy(true); setError("");
    try { await responseJson(await fetch(`/api/matches/${matchId}/questions/${assignment.id}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) })); await loadAssignments(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível revelar a resposta."); }
    finally { setBusy(false); }
  }
  const selected = matches.find(match => match.id === matchId);
  return <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]"><Card className="p-5"><div className="mb-4 flex items-center gap-2"><Shuffle size={18} className="text-blue-600" /><h3 className="font-bold">Sortear para partida</h3></div><div className="space-y-3"><div><label htmlFor="question-match" className="mb-1 block text-sm font-semibold">Partida</label><select id="question-match" value={matchId} onChange={event => setMatchId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Selecione...</option>{matches.map(match => <option key={match.id} value={match.id}>{match.homeTeam.name} vs {match.awayTeam.name}{match.round ? ` · ${match.round}` : ""}</option>)}</select></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="draw-category" className="mb-1 block text-sm font-semibold">Categoria</label><select id="draw-category" value={category} onChange={event => setCategory(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Todas</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></div><div><label htmlFor="draw-difficulty" className="mb-1 block text-sm font-semibold">Dificuldade</label><select id="draw-difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="ALL">Equilibrar todos os níveis</option><option value="EASY">Fácil</option><option value="MEDIUM">Média</option><option value="HARD">Difícil</option></select></div></div><div><label htmlFor="draw-count" className="mb-1 block text-sm font-semibold">Quantidade de questões</label><Input id="draw-count" type="number" min={1} max={100} value={count} onChange={event => setCount(Number(event.target.value))} /></div><Button disabled={!matchId || busy || selected?.status !== "SCHEDULED"} onClick={() => void draw()}><Shuffle size={16} />{busy ? "Processando..." : "Sortear questões"}</Button><p className="text-xs leading-relaxed text-muted-foreground">O sorteio é confirmado diretamente no servidor. A regra de não repetição e os pontos atuais são aplicados ao associar as questões.</p></div></Card><Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-600">Apresentação</p><h3 className="mt-1 font-bold">{selected ? `${selected.homeTeam.name} vs ${selected.awayTeam.name}` : "Escolha uma partida"}</h3></div><MonitorPlay size={22} className="text-blue-600" /></div><div className="rounded-xl bg-[#0b1730] p-6 text-white"><p className="text-xs uppercase tracking-[.18em] text-blue-300">Quiz Bowl · Questões</p><strong className="mt-3 block text-4xl">{assignments.length}</strong><p className="mt-1 text-sm text-slate-300">questão(ões) associada(s)</p><p className="mt-4 text-xs text-slate-400">{assignments.filter(item => item.status === "REVEALED").length} resposta(s) revelada(s)</p></div><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/placar"><MonitorPlay size={15} />Abrir telão</Link></Button><Button variant="ghost" size="sm" onClick={() => void loadAssignments()}><RefreshCw size={15} />Atualizar</Button></div></Card></div>
    {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950"><Check size={16} className="mr-2 inline" />{notice}</p>}{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950"><AlertCircle size={16} className="mr-2 inline" />{error}</p>}
    {!matchId ? <Card className="p-10 text-center text-sm text-muted-foreground">Cadastre uma partida em Partidas para selecionar questões.</Card> : assignments.length === 0 ? <Card className="p-10 text-center text-sm text-muted-foreground">Nenhuma questão associada a esta partida.</Card> : <div className="grid gap-4 lg:grid-cols-2">{assignments.map(item => <Card key={item.id} className="overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-slate-50 px-5 py-3 dark:bg-slate-900"><div className="flex items-center gap-2"><strong>Questão {item.position}</strong><Badge variant={item.status === "REVEALED" ? "green" : "blue"}>{item.status === "REVEALED" ? "Revelada" : "Resposta oculta"}</Badge></div><Badge variant="gray">0 / 5 / 10 pts</Badge></div><div className="space-y-3 p-5"><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{difficultyNames[item.question.difficulty]}</span><span>·</span><span>{item.question.category || "Sem categoria"}</span><span>·</span><span><Clock3 size={13} className="mr-1 inline" />{item.question.timeSeconds}s</span></div><h4 className="font-bold leading-snug">{item.question.statement}</h4>{item.question.imageUrl && <img src={item.question.imageUrl} alt="Imagem da questão" className="max-h-48 w-full rounded-lg object-contain" />}{item.question.type === "MULTIPLE_CHOICE" && <div className="grid gap-1.5">{(item.question.alternatives || []).map((alternative, index) => <div key={index} className="rounded-lg border border-border px-3 py-2 text-sm"><strong className="mr-2 text-blue-600">{String.fromCharCode(65 + index)}.</strong>{alternative}</div>)}</div>}{item.question.type === "TRUE_FALSE" && <p className="text-sm text-muted-foreground">Verdadeiro ou falso</p>}{item.question.type === "SHORT_ANSWER" && <p className="text-sm text-muted-foreground">Resposta curta · correção manual pelo mediador</p>}{item.status === "REVEALED" ? <div className="rounded-lg bg-green-50 p-3 text-sm dark:bg-green-950"><strong>Resposta: {item.question.answer === "TRUE" ? "Verdadeiro" : item.question.answer === "FALSE" ? "Falso" : item.question.answer}</strong>{item.question.explanation && <p className="mt-1 text-muted-foreground">{item.question.explanation}</p>}</div> : selected?.session ? <Button asChild variant="outline" size="sm"><Link href={`/partidas/${matchId}`}><MonitorPlay size={15} />Abrir mediação</Link></Button> : <Button variant="outline" size="sm" disabled={busy} onClick={() => void reveal(item)}><Eye size={15} />Revelar resposta</Button>}</div></Card>)}</div>}
  </div>;
}
