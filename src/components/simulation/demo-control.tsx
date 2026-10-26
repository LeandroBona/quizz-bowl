"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEvent } from "@/components/layout/event-context";
import { responseJson } from "@/lib/api-client";

type DemoState = { isDemo: boolean; stage?: number; event?: { id: string; name: string }; phases?: { name: string; count: number }[]; participants?: number; teams?: number; groups?: number; matches?: number; officialMatches?: number; qualified?: number; bracketMatches?: number; championName?: string | null };
const steps = [
  ["participants", "Gerar 117 participantes e questões fictícias"], ["teams", "Sortear 21 equipes equilibradas"],
  ["groups", "Criar 7 grupos e 21 partidas"], ["fixtures", "Conferir partidas geradas"],
  ["results", "Simular e homologar os resultados"], ["standings", "Validar 14 classificados"],
  ["bracket", "Gerar o mata-mata com 2 vagas diretas"], ["knockout", "Simular 13 partidas eliminatórias"],
  ["champion", "Declarar a equipe campeã"],
] as const;

export function DemoControl({ selectedEventId }: { selectedEventId: string }) {
  const { refreshEvents, setEventId } = useEvent();
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!selectedEventId) { setState({ isDemo: false }); setError(""); return; }
    setState(null);
    try { setState(await responseJson(await fetch(`/api/demo?eventId=${encodeURIComponent(selectedEventId)}`, { cache: "no-store" }))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar a simulação."); }
  }, [selectedEventId]);
  useEffect(() => { void load(); }, [load]);
  async function create() {
    setBusy(true); setError(""); setNotice("");
    try {
      const event: { id: string } = await responseJson(await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "create" }) }));
      await refreshEvents(); setEventId(event.id); setNotice("Evento fictício criado. Execute as etapas abaixo.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao criar demonstração."); }
    finally { setBusy(false); }
  }
  async function step(action: typeof steps[number][0]) {
    setBusy(true); setError(""); setNotice("");
    try { setState(await responseJson(await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "step", eventId: selectedEventId, action }) }))); setNotice("Etapa concluída e persistida."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Falha nesta etapa da simulação."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 text-sm">
    <p className="text-muted-foreground">A demonstração usa um evento próprio e dados fictícios. Seus registros ficam separados dos eventos reais.</p>
    {state === null ? <p className="text-muted-foreground">Carregando simulação…</p> : !state.isDemo ? <Button disabled={busy} onClick={() => void create()}><Play size={16}/>{busy ? "Criando…" : "Criar evento de demonstração"}</Button> : <>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100"><strong>{state.event?.name}</strong><p className="mt-1">{state.participants ?? 0} participantes · {state.teams ?? 0} equipes · {state.groups ?? 0} grupos · {state.officialMatches ?? 0} partidas homologadas</p>{state.phases?.length ? <p className="mt-1 text-xs">{state.phases.map(phase => `${phase.name}: ${phase.count}`).join(" · ")}</p> : null}{state.championName && <p className="mt-2 font-bold">🏆 Campeã: {state.championName}</p>}</div>
      <ol className="space-y-2">{steps.map(([action, label], index) => <li key={action} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"><span className="flex items-center gap-2">{(state.stage ?? 0) > index ? <CheckCircle2 size={17} className="text-emerald-600"/> : <Circle size={17} className="text-muted-foreground"/>}{index + 1}. {label}</span>{(state.stage ?? 0) === index && <Button size="sm" disabled={busy} onClick={() => void step(action)}>{busy ? <RefreshCw size={14} className="animate-spin"/> : "Executar"}</Button>}</li>)}</ol>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/grupos">Ver grupos</Link></Button><Button asChild variant="outline" size="sm"><Link href="/chaveamento">Ver chaveamento</Link></Button><Button asChild variant="outline" size="sm"><Link href="/placar">Abrir telão</Link></Button></div>
    </>}
    {error && <p role="alert" className="text-red-600">{error}</p>}{notice && <p role="status" className="text-emerald-700">{notice}</p>}
  </div>;
}
