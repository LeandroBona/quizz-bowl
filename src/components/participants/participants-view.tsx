"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileSpreadsheet, Filter, GraduationCap, Pencil, Plus, Search, Settings2, Trash2, Upload, Users } from "lucide-react";
import { useEvent } from "@/components/layout/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { responseJson } from "@/lib/api-client";
import { normalizeIdentity } from "@/lib/participant-key";

type Phase = { id: string; name: string; sortOrder: number; _count: { participants: number } };
type Team = { id: string; name: string };
type Participant = { id: string; name: string; phaseId: string | null; phase: Phase | null; className: string | null; participationStatus: "ACTIVE" | "INACTIVE" | "WITHDRAWN"; email: string | null; institution: string | null; membership: { teamId: string; team: Team } | null };
type Form = { name: string; phaseId: string; className: string; participationStatus: Participant["participationStatus"]; email: string; institution: string; teamId: string };
type PreviewRow = { line: number; name: string; phaseLabel: string; className: string; participationStatus: string; status: "valid" | "duplicate" | "invalid"; issues: string[] };
type Preview = { rows: PreviewRow[]; counts: { total: number; valid: number; duplicate: number; invalid: number } };
const situation = { ACTIVE: "Ativo", INACTIVE: "Inativo", WITHDRAWN: "Desistente" };
const emptyForm: Form = { name: "", phaseId: "", className: "", participationStatus: "ACTIVE", email: "", institution: "", teamId: "" };
export function ParticipantsView() {
  const { eventId } = useEvent();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [phaseEditing, setPhaseEditing] = useState<Phase | null>(null);
  const [phaseName, setPhaseName] = useState("");
  const [phaseOrder, setPhaseOrder] = useState(0);
  const [phaseError, setPhaseError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!eventId) { setParticipants([]); setPhases([]); setTeams([]); setLoading(false); return; }
    setLoading(true);
    try {
      const suffix = `?eventId=${encodeURIComponent(eventId)}`;
      const [people, phaseRows, teamRows] = await Promise.all(["participants", "phases", "teams"].map(resource => fetch(`/api/${resource}${suffix}`, { cache: "no-store" }).then(responseJson)));
      setParticipants(people); setPhases(phaseRows); setTeams(teamRows); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao carregar participantes."); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => participants.filter(person => {
    const text = normalizeIdentity(`${person.name} ${person.className || ""} ${person.phase?.name || ""} ${person.membership?.team.name || ""}`);
    return text.includes(normalizeIdentity(query)) && (!phaseFilter || person.phaseId === phaseFilter) && (!statusFilter || person.participationStatus === statusFilter);
  }), [participants, query, phaseFilter, statusFilter]);
  const unassigned = participants.filter(person => person.participationStatus === "ACTIVE" && !person.membership).length;
  function openForm(person: Participant | null) {
    setEditing(person);
    setForm(person ? { name: person.name, phaseId: person.phaseId || "", className: person.className || "", participationStatus: person.participationStatus, email: person.email || "", institution: person.institution || "", teamId: person.membership?.teamId || "" } : { ...emptyForm });
    setFormError(""); setFormOpen(true);
  }
  async function savePerson(event: React.FormEvent) {
    event.preventDefault(); if (!eventId) return;
    setSaving(true); setFormError("");
    try {
      await responseJson(await fetch(`/api/participants${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, eventId }) }));
      setFormOpen(false); await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }
  async function deletePerson(person: Participant) {
    if (!eventId || !window.confirm(`Excluir ${person.name}? Esta ação não pode ser desfeita.`)) return;
    try { await responseJson(await fetch(`/api/participants/${person.id}?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" })); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao excluir."); }
  }
  function openPhase(phase: Phase | null) { setPhaseEditing(phase); setPhaseName(phase?.name || ""); setPhaseOrder(phase?.sortOrder ?? phases.length + 1); setPhaseError(""); setPhaseOpen(true); }
  async function savePhase(event: React.FormEvent) {
    event.preventDefault(); if (!eventId) return;
    try {
      await responseJson(await fetch(`/api/phases${phaseEditing ? `/${phaseEditing.id}` : ""}`, { method: phaseEditing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, name: phaseName, sortOrder: phaseOrder }) }));
      setPhaseEditing(null); setPhaseName(""); setPhaseError(""); await load();
    } catch (caught) { setPhaseError(caught instanceof Error ? caught.message : "Erro ao salvar fase."); }
  }
  async function deletePhase(phase: Phase) {
    if (!eventId || !window.confirm(`Excluir a fase ${phase.name}?`)) return;
    try { await responseJson(await fetch(`/api/phases/${phase.id}?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" })); await load(); }
    catch (caught) { setPhaseError(caught instanceof Error ? caught.message : "Erro ao excluir fase."); }
  }
  async function upload(previewOnly: boolean) {
    if (!file || !eventId) return;
    setImportBusy(true); setImportError("");
    try {
      const data = new FormData(); data.set("eventId", eventId); data.set("file", file);
      const result = await responseJson(await fetch(`/api/participants/import/${previewOnly ? "preview" : "confirm"}`, { method: "POST", body: data }));
      if (previewOnly) setPreview(result);
      else { setImportOpen(false); setFile(null); setPreview(null); setNotice(`${result.imported} participante(s) importado(s); ${result.skipped} ignorado(s).`); await load(); }
    } catch (caught) { setImportError(caught instanceof Error ? caught.message : "Erro na importação."); }
    finally { setImportBusy(false); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-blue-600">Cadastro e distribuição</p><h2 className="text-2xl font-extrabold md:text-3xl">Participantes</h2><p className="mt-1 text-sm text-muted-foreground">Cadastre alunos, organize fases e acompanhe quem já está em equipe.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => openPhase(null)} disabled={!eventId}><Settings2 size={16} />Fases</Button><Button variant="outline" onClick={() => { setImportOpen(true); setImportError(""); }} disabled={!eventId}><Upload size={16} />Importar arquivo</Button><Button onClick={() => openForm(null)} disabled={!eventId || phases.length === 0}><Plus size={16} />Novo participante</Button></div></div>
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950">{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">{error}</p>}
    {!eventId ? <Card className="p-12 text-center"><Users className="mx-auto mb-3 text-blue-500" size={30} /><h3 className="font-bold">Selecione um evento</h3><Button asChild className="mt-4"><Link href="/eventos">Gerenciar eventos <ArrowRight size={16} /></Link></Button></Card> : <>
      {phases.length === 0 && !loading && <Card className="border-blue-200 bg-blue-50 p-5 dark:bg-blue-950"><div className="flex items-start gap-3"><GraduationCap size={22} className="text-blue-600" /><div><h3 className="font-bold">Configure as fases do curso</h3><p className="mt-1 text-sm text-muted-foreground">Cada evento pode ter suas próprias fases. Cadastre ao menos uma antes de incluir participantes.</p><Button size="sm" className="mt-3" onClick={() => openPhase(null)}>Configurar fases</Button></div></div></Card>}
      <div className="grid gap-3 sm:grid-cols-3"><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Participantes</p><strong className="mt-2 block text-3xl font-extrabold">{participants.length}</strong></Card><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fases configuradas</p><strong className="mt-2 block text-3xl font-extrabold">{phases.length}</strong></Card><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ativos sem equipe</p><strong className="mt-2 block text-3xl font-extrabold text-blue-600">{unassigned}</strong></Card></div>
      <Card className="overflow-hidden"><div className="flex flex-wrap gap-3 border-b border-border p-4"><div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Pesquisar participantes" placeholder="Pesquisar por nome, turma ou equipe..." value={query} onChange={event => setQuery(event.target.value)} className="pl-9" /></div><div className="flex items-center gap-2"><Filter size={16} className="text-muted-foreground" /><select aria-label="Filtrar por fase" value={phaseFilter} onChange={event => setPhaseFilter(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Todas as fases</option>{phases.map(phase => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></div><select aria-label="Filtrar por situação" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Todas as situações</option><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="WITHDRAWN">Desistente</option></select></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-muted-foreground dark:bg-slate-900/60"><tr>{["Nome", "Fase", "Turma", "Situação", "Equipe", "Ações"].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody>{filtered.map(person => <tr key={person.id} className="border-t border-border"><td className="px-5 py-4"><strong className="block">{person.name}</strong>{person.email && <span className="text-xs text-muted-foreground">{person.email}</span>}</td><td className="px-5 py-4">{person.phase?.name || <Badge variant="amber">Sem fase</Badge>}</td><td className="px-5 py-4">{person.className || "—"}</td><td className="px-5 py-4"><Badge variant={person.participationStatus === "ACTIVE" ? "green" : "gray"}>{situation[person.participationStatus]}</Badge></td><td className="px-5 py-4">{person.membership?.team.name || <span className="text-muted-foreground">Sem equipe</span>}</td><td className="px-5 py-4"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Editar ${person.name}`} onClick={() => openForm(person)}><Pencil size={16} /></Button><Button size="icon" variant="ghost" aria-label={`Excluir ${person.name}`} title={person.membership ? "Remova o integrante da equipe antes de excluir." : "Excluir participante"} disabled={!!person.membership} onClick={() => void deletePerson(person)} className="text-red-500"><Trash2 size={16} /></Button></div></td></tr>)}</tbody></table>{loading ? <p className="p-10 text-center text-sm text-muted-foreground">Carregando...</p> : filtered.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">Nenhum participante encontrado.</p>}</div></Card>
    </>}
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent title={editing ? "Editar participante" : "Novo participante"}><form onSubmit={event => void savePerson(event)} className="space-y-4"><div><label htmlFor="person-name" className="mb-1 block text-sm font-semibold">Nome completo *</label><Input id="person-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required minLength={2} /></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="person-phase" className="mb-1 block text-sm font-semibold">Fase *</label><select id="person-phase" value={form.phaseId} onChange={event => setForm({ ...form, phaseId: event.target.value })} required className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Selecione...</option>{phases.map(phase => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></div><div><label htmlFor="person-class" className="mb-1 block text-sm font-semibold">Turma</label><Input id="person-class" value={form.className} onChange={event => setForm({ ...form, className: event.target.value })} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="person-status" className="mb-1 block text-sm font-semibold">Situação</label><select id="person-status" value={form.participationStatus} onChange={event => setForm({ ...form, participationStatus: event.target.value as Form["participationStatus"] })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="WITHDRAWN">Desistente</option></select></div><div><label htmlFor="person-team" className="mb-1 block text-sm font-semibold">Equipe</label><select id="person-team" value={form.teamId} onChange={event => setForm({ ...form, teamId: event.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Sem equipe</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="person-email" className="mb-1 block text-sm font-semibold">E-mail</label><Input id="person-email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></div><div><label htmlFor="person-institution" className="mb-1 block text-sm font-semibold">Instituição</label><Input id="person-institution" value={form.institution} onChange={event => setForm({ ...form, institution: event.target.value })} /></div></div>{formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button disabled={saving}>{saving ? "Salvando..." : "Salvar participante"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={phaseOpen} onOpenChange={setPhaseOpen}><DialogContent title="Fases do evento"><div className="space-y-4"><p className="text-sm text-muted-foreground">Defina as fases disponíveis para o cadastro e o sorteio deste evento.</p><div className="max-h-64 space-y-2 overflow-y-auto">{phases.map(phase => <div key={phase.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><GraduationCap size={17} /></span><span className="flex-1"><strong className="block text-sm">{phase.name}</strong><small className="text-muted-foreground">{phase._count.participants} participante(s)</small></span><Button size="icon" variant="ghost" aria-label={`Editar fase ${phase.name}`} onClick={() => openPhase(phase)}><Pencil size={16} /></Button><Button size="icon" variant="ghost" aria-label={`Excluir fase ${phase.name}`} disabled={phase._count.participants > 0} onClick={() => void deletePhase(phase)} className="text-red-500"><Trash2 size={16} /></Button></div>)}</div><form onSubmit={event => void savePhase(event)} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_90px_auto]"><div><label htmlFor="phase-name" className="mb-1 block text-xs font-semibold">Nome da fase</label><Input id="phase-name" value={phaseName} onChange={event => setPhaseName(event.target.value)} placeholder="Ex.: 4ª fase" required /></div><div><label htmlFor="phase-order" className="mb-1 block text-xs font-semibold">Ordem</label><Input id="phase-order" type="number" min={0} value={phaseOrder} onChange={event => setPhaseOrder(Number(event.target.value))} /></div><Button className="self-end">{phaseEditing ? "Atualizar" : "Adicionar"}</Button></form>{phaseEditing && <Button size="sm" variant="ghost" onClick={() => { setPhaseEditing(null); setPhaseName(""); }}>Cancelar edição</Button>}{phaseError && <p role="alert" className="text-sm text-red-600">{phaseError}</p>}</div></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent title="Importar participantes" className="max-w-4xl"><div className="space-y-4"><div className="rounded-xl bg-blue-50 p-4 text-sm text-slate-700 dark:bg-blue-950 dark:text-slate-200"><div className="mb-2 flex items-center gap-2 font-bold"><FileSpreadsheet size={18} />CSV ou XLSX · até 5 MB</div><p>Colunas obrigatórias: <strong>Nome</strong> e <strong>Fase</strong>. Opcionais: Turma, Situação, Email e Instituição. A fase precisa estar configurada no evento. Duplicatas são identificadas por nome, fase e turma.</p></div><Input aria-label="Selecionar arquivo CSV ou XLSX" type="file" accept=".csv,.xlsx" onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setImportError(""); }} /><Button variant="outline" disabled={!file || importBusy} onClick={() => void upload(true)}><Search size={16} />{importBusy ? "Analisando..." : "Pré-visualizar"}</Button>{preview && <><div className="flex flex-wrap gap-2"><Badge variant="gray">{preview.counts.total} linhas</Badge><Badge variant="green">{preview.counts.valid} válidas</Badge><Badge variant="amber">{preview.counts.duplicate} duplicadas</Badge><Badge variant="gray">{preview.counts.invalid} inválidas</Badge></div><div className="max-h-72 overflow-auto rounded-xl border border-border"><table className="w-full min-w-[600px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-muted-foreground dark:bg-slate-900"><tr>{["Linha", "Nome", "Fase", "Turma", "Resultado"].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{preview.rows.map(row => <tr key={row.line} className="border-t border-border"><td className="px-3 py-2">{row.line}</td><td className="px-3 py-2 font-semibold">{row.name || "—"}</td><td className="px-3 py-2">{row.phaseLabel || "—"}</td><td className="px-3 py-2">{row.className || "—"}</td><td className="px-3 py-2"><Badge variant={row.status === "valid" ? "green" : row.status === "duplicate" ? "amber" : "gray"}>{row.status === "valid" ? "Válido" : row.status === "duplicate" ? "Duplicado" : "Inválido"}</Badge>{row.issues.length > 0 && <p className="mt-1 max-w-xs text-red-600">{row.issues.join(" ")}</p>}</td></tr>)}</tbody></table></div><div className="flex justify-end"><Button disabled={!preview.counts.valid || importBusy} onClick={() => void upload(false)}><Upload size={16} />Importar {preview.counts.valid} válido(s)</Button></div></>}{importError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{importError}</p>}</div></DialogContent></Dialog>
  </div>;
}
