"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, Plus, Shuffle, Trash2, UsersRound, UserPlus, X } from "lucide-react";
import { useEvent } from "@/components/layout/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { responseJson } from "@/lib/api-client";

type Participant = { id: string; name: string; phaseId: string | null; phase: { name: string } | null; participationStatus: string; membership: { teamId: string } | null };
type Team = { id: string; name: string; institution: string | null; color: string | null; minMembers: number | null; maxMembers: number | null; members: { participantId: string; participant: Participant }[]; _count: { members: number } };
type Phase = { id: string; name: string };
export function TeamsView() {
  const { eventId } = useEvent();
  const [teams, setTeams] = useState<Team[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Team | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [color, setColor] = useState("#2563EB");
  const [formError, setFormError] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [swapFirst, setSwapFirst] = useState<Participant | null>(null);
  const [swapSecond, setSwapSecond] = useState("");
  const [swapError, setSwapError] = useState("");
  const load = useCallback(async () => {
    if (!eventId) { setTeams([]); setParticipants([]); setPhases([]); setLoading(false); return; }
    setLoading(true);
    try {
      const suffix = `?eventId=${encodeURIComponent(eventId)}`;
      const [teamRows, people, phaseRows] = await Promise.all(["teams", "participants", "phases"].map(resource => fetch(`/api/${resource}${suffix}`, { cache: "no-store" }).then(responseJson)));
      setTeams(teamRows); setParticipants(people); setPhases(phaseRows); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao carregar equipes."); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  const unassigned = useMemo(() => participants.filter(person => person.participationStatus === "ACTIVE" && !person.membership), [participants]);
  const grouped = useMemo(() => phases.map(phase => ({ ...phase, total: participants.filter(person => person.phaseId === phase.id && person.participationStatus === "ACTIVE").length, assigned: participants.filter(person => person.phaseId === phase.id && person.participationStatus === "ACTIVE" && person.membership).length })), [phases, participants]);
  function openForm(team: Team | null) { setEditing(team); setName(team?.name || ""); setInstitution(team?.institution || ""); setColor(team?.color || "#2563EB"); setFormError(""); setFormOpen(true); }
  async function saveTeam(event: React.FormEvent) {
    event.preventDefault(); if (!eventId) return;
    try { await responseJson(await fetch(`/api/teams${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, name, institution, color }) })); setFormOpen(false); await load(); }
    catch (caught) { setFormError(caught instanceof Error ? caught.message : "Erro ao salvar equipe."); }
  }
  async function removeTeam(team: Team) {
    if (!eventId || !window.confirm(`Excluir a equipe ${team.name}?`)) return;
    try { await responseJson(await fetch(`/api/teams/${team.id}?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" })); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao excluir equipe."); }
  }
  async function changeTeam(participantId: string, teamId: string | null) {
    if (!eventId) return;
    try { await responseJson(await fetch(`/api/participants/${participantId}/team`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, teamId }) })); setChosen({}); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao alterar integrante."); }
  }
  async function swap() {
    if (!eventId || !swapFirst || !swapSecond) return;
    try { await responseJson(await fetch("/api/teams/swap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, firstId: swapFirst.id, secondId: swapSecond }) })); setSwapFirst(null); setSwapSecond(""); await load(); }
    catch (caught) { setSwapError(caught instanceof Error ? caught.message : "Erro ao trocar integrantes."); }
  }
  const sourceTeamId = teams.find(team => team.members.some(member => member.participantId === swapFirst?.id))?.id;
  const swapCandidates = swapFirst ? [...teams.filter(team => team.id !== sourceTeamId).flatMap(team => team.members.map(member => ({ ...member.participant, teamName: team.name }))), ...unassigned.map(person => ({ ...person, teamName: "Sem equipe" }))] : [];
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-blue-600">Formação de equipes</p><h2 className="text-2xl font-extrabold md:text-3xl">Equipes</h2><p className="mt-1 text-sm text-muted-foreground">Monte equipes, acompanhe fases e faça ajustes nos integrantes.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/sorteio"><Shuffle size={16} />Sorteio automático</Link></Button><Button onClick={() => openForm(null)} disabled={!eventId}><Plus size={16} />Nova equipe</Button></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">{error}</p>}
    {!eventId ? <Card className="p-12 text-center"><UsersRound size={30} className="mx-auto mb-3 text-blue-500" /><h3 className="font-bold">Selecione um evento</h3><Button asChild className="mt-4"><Link href="/eventos">Gerenciar eventos <ArrowRight size={16} /></Link></Button></Card> : <>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"><Card className="p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Participação</p><div className="mt-3 flex items-end gap-8"><div><strong className="text-3xl font-extrabold">{teams.length}</strong><p className="text-xs text-muted-foreground">equipes</p></div><div><strong className="text-3xl font-extrabold">{unassigned.length}</strong><p className="text-xs text-muted-foreground">ativos sem equipe</p></div></div></Card><Card className="p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Distribuição por fase</p><div className="mt-3 flex flex-wrap gap-2">{grouped.length ? grouped.map(phase => <div key={phase.id} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="block text-xs font-semibold">{phase.name}</span><strong className="text-sm">{phase.assigned}/{phase.total}</strong><span className="ml-1 text-xs text-muted-foreground">em equipes</span></div>) : <p className="text-sm text-muted-foreground">Configure fases em Participantes.</p>}</div></Card></div>
      {unassigned.length > 0 && <Card className="p-5"><div className="mb-3 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /><h3 className="font-bold">Sem equipe</h3><Badge variant="gray">{unassigned.length}</Badge></div><div className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">{unassigned.map(person => <div key={person.id} className="flex items-center gap-2 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.name}</strong><span className="text-xs text-muted-foreground">{person.phase?.name || "Sem fase"}</span></div><select aria-label={`Adicionar ${person.name} à equipe`} value={chosen[person.id] || ""} onChange={event => { setChosen(value => ({ ...value, [person.id]: event.target.value })); if (event.target.value) void changeTeam(person.id, event.target.value); }} className="h-9 max-w-32 rounded-lg border border-border bg-card px-2 text-xs"><option value="">Adicionar...</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>)}</div></Card>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando equipes...</p> : teams.length === 0 ? <Card className="p-12 text-center"><UsersRound size={32} className="mx-auto mb-3 text-blue-500" /><h3 className="font-bold">Nenhuma equipe ainda</h3><p className="mt-1 text-sm text-muted-foreground">Crie equipes manualmente ou use o sorteio automático.</p></Card> : <div className="grid gap-4 lg:grid-cols-2">{teams.map(team => <Card key={team.id} className="overflow-hidden"><div className="flex items-center gap-3 border-b border-border p-5"><span className="h-11 w-11 rounded-xl" style={{ background: team.color || "#2563EB" }} /><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{team.name}</h3><p className="text-xs text-muted-foreground">{team.members.length} integrante(s){team.minMembers != null && team.maxMembers != null ? ` · limite ${team.minMembers}–${team.maxMembers}` : ""}</p></div><Button size="sm" variant="ghost" onClick={() => openForm(team)}>Renomear</Button><Button size="icon" variant="ghost" aria-label={`Excluir ${team.name}`} title="Disponível após remover integrantes, grupos e partidas" onClick={() => void removeTeam(team)} className="text-red-500"><Trash2 size={16} /></Button></div><div className="space-y-1 p-4">{team.members.length ? team.members.map(member => <div key={member.participantId} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.participant.name}</strong><span className="text-xs text-muted-foreground">{member.participant.phase?.name || "Sem fase"}</span></div><select aria-label={`Mover ${member.participant.name}`} value={team.id} onChange={event => void changeTeam(member.participantId, event.target.value)} className="h-8 max-w-28 rounded-lg border border-border bg-card px-2 text-xs">{teams.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select><Button size="icon" variant="ghost" aria-label={`Trocar ${member.participant.name}`} title="Trocar com integrante de outra equipe" onClick={() => { setSwapFirst(member.participant); setSwapSecond(""); setSwapError(""); }}><ArrowRightLeft size={15} /></Button><Button size="icon" variant="ghost" aria-label={`Remover ${member.participant.name}`} title="Remover da equipe" onClick={() => void changeTeam(member.participantId, null)}><X size={16} /></Button></div>) : <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhum integrante. Adicione alunos da lista acima.</p>}</div><div className="flex flex-wrap gap-1 border-t border-border px-5 py-3">{phases.map(phase => { const count = team.members.filter(member => member.participant.phaseId === phase.id).length; return <Badge key={phase.id} variant={count ? "blue" : "gray"}>{phase.name}: {count}</Badge>; })}</div></Card>)}</div>}
    </>}
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent title={editing ? "Editar equipe" : "Nova equipe"}><form onSubmit={event => void saveTeam(event)} className="space-y-4"><div><label htmlFor="team-name" className="mb-1 block text-sm font-semibold">Nome *</label><Input id="team-name" value={name} onChange={event => setName(event.target.value)} required minLength={2} /></div><div><label htmlFor="team-institution" className="mb-1 block text-sm font-semibold">Instituição</label><Input id="team-institution" value={institution} onChange={event => setInstitution(event.target.value)} /></div><div><label htmlFor="team-color" className="mb-1 block text-sm font-semibold">Cor</label><Input id="team-color" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-11 p-1" /></div>{formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button>Salvar equipe</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!swapFirst} onOpenChange={open => { if (!open) setSwapFirst(null); }}><DialogContent title="Trocar integrantes"><div className="space-y-4"><p className="text-sm text-muted-foreground">Troque <strong>{swapFirst?.name}</strong> com um integrante de outra equipe ou com um aluno sem equipe. O tamanho da equipe de origem permanece igual.</p><select aria-label="Integrante para troca" value={swapSecond} onChange={event => setSwapSecond(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Escolha um integrante...</option>{swapCandidates.map(person => <option key={person.id} value={person.id}>{person.name} · {person.teamName}</option>)}</select>{swapError && <p role="alert" className="text-sm text-red-600">{swapError}</p>}<div className="flex justify-end"><Button disabled={!swapSecond} onClick={() => void swap()}><ArrowRightLeft size={16} />Confirmar troca</Button></div></div></DialogContent></Dialog>
  </div>;
}
