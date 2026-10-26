"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, MonitorPlay, Radio, Save } from "lucide-react";
import { useEvent } from "@/components/layout/event-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { responseJson } from "@/lib/api-client";

type Mode = "OPENING" | "TEAMS" | "QUESTION" | "REVEAL" | "SCORE" | "STANDINGS" | "BRACKET" | "CHAMPION";
type MatchOption = { id: string; round: string | null; group: { name: string } | null; homeTeam: { name: string }; awayTeam: { name: string } };
type ControlState = { event: { id: string; name: string }; presentation: { mode: Mode; matchId: string | null; logoUrl: string | null; welcomeMessage: string | null; showQuestionScore: boolean; showExplanation: boolean; soundsEnabled: boolean }; matches: MatchOption[] };
const modes: { id: Mode; label: string; hint: string }[] = [
  { id: "OPENING", label: "Abertura", hint: "Nome e boas-vindas" }, { id: "TEAMS", label: "Equipes", hint: "Integrantes e fases" },
  { id: "QUESTION", label: "Pergunta", hint: "Enunciado e cronômetro" }, { id: "REVEAL", label: "Revelação", hint: "Gabarito autorizado" },
  { id: "SCORE", label: "Placar", hint: "Pontuação ao vivo" }, { id: "STANDINGS", label: "Grupos e classificação", hint: "Tabelas e resultados" },
  { id: "BRACKET", label: "Chaveamento", hint: "Caminho até a final" }, { id: "CHAMPION", label: "Campeã", hint: "Troféu e celebração" },
];
export function PresentationControl() {
  const { eventId } = useEvent();
  const [data, setData] = useState<ControlState | null>(null);
  const [matchId, setMatchId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [showQuestionScore, setShowQuestionScore] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!eventId) { setData(null); return; }
    try {
      const result: ControlState = await responseJson(await fetch(`/api/presentation?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" }));
      setData(result); setMatchId(result.presentation.matchId ?? ""); setLogoUrl(result.presentation.logoUrl ?? ""); setWelcomeMessage(result.presentation.welcomeMessage ?? ""); setShowQuestionScore(result.presentation.showQuestionScore); setShowExplanation(result.presentation.showExplanation); setSoundsEnabled(result.presentation.soundsEnabled); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar o telão."); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!eventId) return;
    const stream = new EventSource(`/api/public/events/${encodeURIComponent(eventId)}/stream`);
    stream.addEventListener("presentation", event => {
      const snapshot = JSON.parse((event as MessageEvent).data) as { mode: Mode; match?: { id: string } | null };
      if (snapshot.match?.id) setMatchId(snapshot.match.id);
      setData(previous => previous ? { ...previous, presentation: { ...previous.presentation, mode: snapshot.mode, matchId: snapshot.match?.id ?? previous.presentation.matchId } } : previous);
    });
    return () => stream.close();
  }, [eventId]);
  async function apply(mode: Mode) {
    if (!eventId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await responseJson(await fetch("/api/presentation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, mode, matchId: matchId || null, logoUrl: logoUrl || null, welcomeMessage: welcomeMessage || null, showQuestionScore, showExplanation, soundsEnabled }) }));
      setData(previous => previous ? { ...previous, presentation: { mode, matchId: matchId || null, logoUrl: logoUrl || null, welcomeMessage: welcomeMessage || null, showQuestionScore, showExplanation, soundsEnabled } } : previous);
      setNotice(`${modes.find(item => item.id === mode)?.label} no telão. A janela pública foi atualizada.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o telão."); }
    finally { setBusy(false); }
  }
  if (!eventId) return <Card className="p-10 text-center">Selecione um evento para controlar o telão.</Card>;
  const url = `/telao/${encodeURIComponent(eventId)}`;
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Apresentação ao vivo</p><h2 className="mt-1 text-3xl font-extrabold">Placar e Telão</h2><p className="mt-2 text-sm text-muted-foreground">Controle o que o público vê em uma janela separada. A mediação continua em Partidas.</p></div><Button asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/>Abrir telão público</a></Button></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><div className="space-y-6"><Card className="p-6"><div className="mb-5 flex items-center gap-2"><MonitorPlay size={19} className="text-blue-600"/><h3 className="font-bold">Configuração da apresentação</h3></div><label className="mb-2 block text-sm font-semibold" htmlFor="presentation-match">Partida em destaque</label><select id="presentation-match" className="mb-5 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm" value={matchId} onChange={event => setMatchId(event.target.value)}><option value="">Selecione uma partida</option>{data?.matches.map(match => <option key={match.id} value={match.id}>{match.homeTeam.name} × {match.awayTeam.name} · {match.group?.name ?? match.round ?? "Partida"}</option>)}</select><label className="mb-2 block text-sm font-semibold" htmlFor="presentation-logo">URL do logo (opcional)</label><Input id="presentation-logo" type="url" placeholder="https://..." value={logoUrl} onChange={event => setLogoUrl(event.target.value)} className="mb-5"/><label className="mb-2 block text-sm font-semibold" htmlFor="presentation-welcome">Mensagem de boas-vindas</label><textarea id="presentation-welcome" rows={3} maxLength={500} className="mb-5 w-full rounded-lg border border-border bg-card p-3 text-sm" value={welcomeMessage} onChange={event => setWelcomeMessage(event.target.value)} placeholder="Mensagem exibida na abertura"/><div className="space-y-3 text-sm"><label className="flex items-center gap-3"><input type="checkbox" checked={showQuestionScore} onChange={event => setShowQuestionScore(event.target.checked)}/>Exibir placar durante a pergunta</label><label className="flex items-center gap-3"><input type="checkbox" checked={showExplanation} onChange={event => setShowExplanation(event.target.checked)}/>Exibir explicação após revelar</label><label className="flex items-center gap-3"><input type="checkbox" checked={soundsEnabled} onChange={event => setSoundsEnabled(event.target.checked)}/>Habilitar efeitos sonoros opcionais</label></div><Button variant="outline" className="mt-6" disabled={busy || !data} onClick={() => void apply(data?.presentation.mode ?? "OPENING")}><Save size={16}/>Salvar configuração</Button></Card><Card className="p-6"><div className="mb-2 flex items-center gap-2"><Radio size={18} className="text-emerald-500"/><h3 className="font-bold">Sincronização</h3></div><p className="text-sm text-muted-foreground">Vários professores podem trabalhar ao mesmo tempo. Se você mostrar Classificação ou Chaveamento, a mediação continua registrando pontos sem trocar esta tela. Escolha Placar ou Pergunta para voltar à partida.</p><p className="mt-3 text-xs text-muted-foreground">O telão recebe atualizações por SSE. Para ouvir os efeitos, ative o áudio uma vez na janela pública.</p></Card></div><div className="space-y-6"><Card className="p-6"><div className="mb-5"><h3 className="font-bold">Escolha a tela</h3><p className="text-sm text-muted-foreground">Tela atual: <strong className="text-foreground">{modes.find(item => item.id === data?.presentation.mode)?.label ?? "Carregando"}</strong></p></div><div className="grid gap-3 sm:grid-cols-2">{modes.map(mode => <button key={mode.id} disabled={busy || !data} onClick={() => void apply(mode.id)} className={`rounded-xl border p-4 text-left transition hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/30 ${data?.presentation.mode === mode.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-border"}`}><strong className="block text-base">{mode.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{mode.hint}</span></button>)}</div><p className="mt-5 text-xs text-muted-foreground">Pergunta e revelação exigem ação prévia do mediador. A tela de campeã exige final homologada.</p></Card><Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border px-5 py-3"><h3 className="font-bold">Prévia pública</h3><a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-blue-600">Nova janela <ExternalLink size={13}/></a></div><iframe title="Prévia do telão público" src={url} className="aspect-video w-full border-0 bg-[#06142e]"/></Card></div></div></div>;
}
