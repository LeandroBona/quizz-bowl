"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, RotateCcw, Shuffle, SlidersHorizontal, Sparkles, UsersRound } from "lucide-react";
import { useEvent } from "@/components/layout/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { responseJson } from "@/lib/api-client";
import { analyzeDraw, type DrawAnalysis, type DrawConfig, type DrawParticipant, type DrawTeam } from "@/lib/team-draw";

type Context = { participants: DrawParticipant[]; phases: { id: string; name: string; count: number }[]; missingPhase: number; existingTeamCount: number; defaults: { teamCount: number; minMembers: number; maxMembers: number } | null };
type Preview = { analysis: DrawAnalysis; teams: DrawTeam[]; seed: string; signature: string };
export function DrawView() {
  const router = useRouter();
  const { eventId } = useEvent();
  const [context, setContext] = useState<Context | null>(null);
  const [config, setConfig] = useState<DrawConfig>({ teamCount: 1, minSize: 5, maxSize: 6 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!eventId) { setContext(null); setLoading(false); return; }
    setLoading(true); setPreview(null);
    try {
      const result: Context = await responseJson(await fetch(`/api/team-draw/context?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" }));
      setContext(result);
      setConfig(current => ({ ...current, teamCount: result.defaults?.teamCount ?? Math.max(1, Math.round(result.participants.length / 5.5)), minSize: result.defaults?.minMembers ?? current.minSize, maxSize: result.defaults?.maxMembers ?? current.maxSize }));
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao carregar os dados do sorteio."); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  const analysis = useMemo(() => context ? analyzeDraw(context.participants, config) : null, [context, config]);
  function setNumber(field: keyof DrawConfig, value: string) { setConfig(current => ({ ...current, [field]: Number(value) })); setPreview(null); }
  async function draw() {
    if (!eventId) return;
    setBusy(true); setError("");
    try { setPreview(await responseJson(await fetch("/api/team-draw/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, ...config }) }))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao sortear."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!eventId || !preview) return;
    setBusy(true); setError("");
    try {
      await responseJson(await fetch("/api/team-draw/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, ...config, seed: preview.seed, signature: preview.signature }) }));
      router.push("/equipes"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao confirmar. Sorteie novamente."); setPreview(null); await load(); }
    finally { setBusy(false); }
  }
  const distribution = analysis?.sizes.reduce((map, size) => map.set(size, (map.get(size) || 0) + 1), new Map<number, number>());
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-blue-600">Formação equilibrada</p><h2 className="text-2xl font-extrabold md:text-3xl">Sorteio de equipes</h2><p className="mt-1 text-sm text-muted-foreground">A prévia é provisória. As equipes só são salvas depois da confirmação.</p></div><Button asChild variant="outline"><Link href="/equipes"><UsersRound size={16} />Ver equipes</Link></Button></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">{error}</p>}
    {!eventId ? <Card className="p-12 text-center"><UsersRound size={30} className="mx-auto mb-3 text-blue-500" /><h3 className="font-bold">Selecione um evento</h3><Button asChild className="mt-4"><Link href="/eventos">Gerenciar eventos <ArrowRight size={16} /></Link></Button></Card> : loading ? <Card className="p-10 text-center text-sm text-muted-foreground">Carregando participantes...</Card> : !context ? <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar o sorteio.</Card> : <>
      <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]"><Card className="p-5"><div className="mb-5 flex items-center gap-2"><SlidersHorizontal size={19} className="text-blue-600" /><h3 className="font-bold">Configurações do sorteio</h3></div><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1"><div><label htmlFor="draw-teams" className="mb-1 block text-sm font-semibold">Equipes desejadas</label><Input id="draw-teams" type="number" min={1} value={config.teamCount} onChange={event => setNumber("teamCount", event.target.value)} /></div><div><label htmlFor="draw-min" className="mb-1 block text-sm font-semibold">Mínimo de integrantes</label><Input id="draw-min" type="number" min={1} value={config.minSize} onChange={event => setNumber("minSize", event.target.value)} /></div><div><label htmlFor="draw-max" className="mb-1 block text-sm font-semibold">Máximo de integrantes</label><Input id="draw-max" type="number" min={1} value={config.maxSize} onChange={event => setNumber("maxSize", event.target.value)} /></div></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Participam apenas alunos ativos e ainda sem equipe. Equipes existentes e seus integrantes não são alterados.</p></Card><Card className="p-5"><div className="mb-4 flex items-center gap-2"><Sparkles size={19} className="text-blue-600" /><h3 className="font-bold">Participantes disponíveis</h3><Badge variant="blue">{context.participants.length}</Badge></div>{context.phases.length ? <div className="grid gap-2 sm:grid-cols-2">{context.phases.map(phase => <div key={phase.id} className="flex items-center justify-between rounded-xl border border-border p-3"><span className="text-sm font-semibold">{phase.name}</span><strong className="text-xl tabular-nums">{phase.count}</strong></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma fase com participantes disponíveis.</p>}{context.missingPhase > 0 && <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"><AlertCircle size={17} className="shrink-0" />{context.missingPhase} participante(s) ativo(s) ainda não têm fase. Complete esses cadastros antes de sortear.</div>}{context.existingTeamCount > 0 && <p className="mt-4 text-xs text-muted-foreground">{context.existingTeamCount} equipe(s) já cadastrada(s) neste evento.</p>}</Card></div>
      <Card className="p-5"><h3 className="font-bold">Viabilidade e prévia da distribuição</h3>{analysis && <div className="mt-4 space-y-4"><div className="flex flex-wrap gap-2"><Badge variant={analysis.feasible ? "green" : "amber"}>{analysis.feasible ? "Tamanhos viáveis" : "Ajuste necessário"}</Badge><Badge variant={analysis.fullDiversityPossible ? "blue" : "amber"}>{analysis.fullDiversityPossible ? "Todas as fases em cada equipe" : "Diversidade parcial"}</Badge></div>{analysis.feasible && <div className="flex flex-wrap gap-3">{[...(distribution?.entries() || [])].sort((a, b) => a[0] - b[0]).map(([size, count]) => <div key={size} className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800"><strong className="text-lg">{count}</strong><span className="ml-2 text-sm text-muted-foreground">equipe(s) de {size}</span></div>)}</div>}{analysis.warnings.map((warning, index) => <div key={index} className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"><AlertCircle size={17} className="shrink-0" />{warning}</div>)}</div>}<div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void draw()} disabled={!analysis?.feasible || !!context.missingPhase || busy}><Shuffle size={17} />Sortear equipes</Button>{preview && <Button variant="outline" disabled={busy} onClick={() => void draw()}><RotateCcw size={17} />Sortear novamente</Button>}</div></Card>
      {preview && <><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Prévia provisória</p><h3 className="text-xl font-bold">{preview.teams.length} equipes formadas</h3><p className="mt-1 text-sm text-muted-foreground">Confira a composição antes de salvar. Um novo sorteio substitui esta prévia.</p></div><Button onClick={() => void confirm()} disabled={busy || !preview.analysis.feasible}><Check size={17} />{busy ? "Confirmando..." : "Confirmar sorteio"}</Button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{preview.teams.map(team => <Card key={team.number} className="overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900"><div><h4 className="font-bold">{team.name}</h4><p className="text-xs text-muted-foreground">{team.members.length} de {team.targetSize} vagas</p></div><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><UsersRound size={18} /></span></div><div className="divide-y divide-border px-5">{team.members.map(person => <div key={person.id} className="flex items-center justify-between gap-2 py-2.5 text-sm"><span className="min-w-0 truncate font-medium">{person.name}</span><span className="shrink-0 text-xs text-muted-foreground">{person.phaseName}</span></div>)}</div><div className="flex flex-wrap gap-1 border-t border-border px-5 py-3">{preview.analysis.phases.map(phase => <Badge key={phase.id} variant={team.phaseCounts[phase.id] ? "blue" : "gray"}>{phase.name}: {team.phaseCounts[phase.id] || 0}</Badge>)}</div></Card>)}</div><div className="flex justify-end"><Button onClick={() => void confirm()} disabled={busy}><Check size={17} />Confirmar sorteio</Button></div></>}
    </>}
  </div>;
}
