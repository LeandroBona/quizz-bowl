"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEvent } from "@/components/layout/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { config, statusLabels, type Field } from "@/lib/resource-config";
import { formatDate } from "@/lib/utils";
import type { Resource } from "@/lib/validations";

type Row = Record<string, any> & { id: string };
const defaults: Record<string, unknown> = { status: "PLANNED", difficulty: "MEDIUM", points: 10, color: "#2563EB", homeScore: 0, awayScore: 0, teamIds: [] };
function toLocalDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function initialForm(resource: Resource, row: Row | null) {
  const result: Record<string, any> = {};
  for (const field of config[resource].fields) {
    if (field.name === "teamId") result.teamId = row?.membership?.teamId || "";
    else if (field.name === "teamIds") result.teamIds = row?.teams?.map((item: Row) => item.teamId) || [];
    else if (field.type === "date") result[field.name] = toLocalDate(row?.[field.name]);
    else result[field.name] = row?.[field.name] ?? defaults[field.name] ?? "";
  }
  if (resource === "matches" && !row) result.status = "SCHEDULED";
  if (resource === "questions" && !row) result.status = "DRAFT";
  return result;
}
async function readResponse(response: Response) {
  if (response.ok) return response.status === 204 ? null : response.json();
  const body = await response.json().catch(() => ({}));
  throw new Error(body.issues?.[0]?.message || body.error || "Erro inesperado.");
}
function FieldControl({ field, value, setValue, options }: { field: Field; value: any; setValue: (value: any) => void; options: Row[] }) {
  const sourceOptions = field.source ? options.map(item => ({ value: item.id, label: item.name })) : field.options || [];
  const label = <label htmlFor={field.name} className="mb-1.5 block text-sm font-semibold">{field.label}{field.required && <span className="ml-1 text-blue-600">*</span>}</label>;
  if (field.type === "textarea") return <div>{label}<Textarea id={field.name} value={value ?? ""} onChange={e => setValue(e.target.value)} required={field.required} rows={field.name === "rules" ? 5 : 3} /></div>;
  if (field.type === "select") return <div>{label}<select id={field.name} value={value ?? ""} onChange={e => setValue(e.target.value)} required={field.required} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecione...</option>{sourceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
  if (field.type === "multiselect") return <div>{label}<div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border p-3">{sourceOptions.length ? sourceOptions.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"><input type="checkbox" checked={(value || []).includes(option.value)} onChange={e => setValue(e.target.checked ? [...(value || []), option.value] : (value || []).filter((id: string) => id !== option.value))} className="accent-blue-600" />{option.label}</label>) : <p className="text-sm text-muted-foreground">Cadastre equipes primeiro.</p>}</div></div>;
  return <div>{label}<Input id={field.name} type={field.type === "date" ? "datetime-local" : field.type || "text"} value={value ?? ""} onChange={e => setValue(e.target.value)} required={field.required} min={field.type === "number" ? 0 : undefined} className={field.type === "color" ? "h-11 p-1" : undefined} /></div>;
}
function renderCells(resource: Resource, row: Row) {
  switch (resource) {
    case "events": return [<div key="name"><strong className="block">{row.name}</strong><span className="text-xs text-muted-foreground">{row.venue || "Local a definir"}</span></div>, formatDate(row.startsAt), <Badge key="status" variant={row.status === "ACTIVE" ? "green" : row.status === "FINISHED" ? "gray" : "blue"}>{statusLabels[row.status]}</Badge>];
    case "participants": return [<div key="name"><strong className="block">{row.name}</strong><span className="text-xs text-muted-foreground">{row.email || "Sem e-mail"}</span></div>, row.institution || "—", row.membership?.team?.name || "—"];
    case "teams": return [<div key="name" className="flex items-center gap-3"><span className="h-9 w-9 rounded-xl" style={{ background: row.color || "#2563EB" }} /><strong>{row.name}</strong></div>, row.institution || "—", row._count?.members ?? 0];
    case "questions": return [<span key="statement" className="block max-w-md truncate font-semibold" title={row.statement}>{row.statement}</span>, row.category || "—", statusLabels[row.difficulty], row.points, <Badge key="status" variant={row.status === "READY" ? "green" : "gray"}>{statusLabels[row.status]}</Badge>];
    case "groups": return [<strong key="name">{row.name}</strong>, row.stage || "—", row.teams?.map((item: Row) => item.team.name).join(", ") || "Nenhuma equipe"];
    case "matches": return [<div key="teams"><small className="mb-1 block font-bold text-blue-600">Partida {row.sequence}</small><strong>{row.homeTeam?.name} <span className="font-normal text-muted-foreground">vs</span> {row.awayTeam?.name}</strong></div>, <span key="round">{row.group?.name || row.round || "—"}{row.group && row.round && <small className="block text-muted-foreground">{row.round}</small>}</span>, formatDate(row.scheduledAt), <span key="score" className="font-bold tabular-nums">{row.homeScore} : {row.awayScore}</span>, <Badge key="status" variant={row.officialAt ? "green" : row.status === "LIVE" ? "blue" : row.status === "FINISHED" ? "amber" : "gray"}>{row.officialAt ? "Homologada" : row.status === "FINISHED" ? "Em revisão" : statusLabels[row.status]}</Badge>];
  }
}
export function ResourceManager({ resource }: { resource: Resource }) {
  const { eventId, loading: eventsLoading, refreshEvents, setEventId, error: eventError } = useEvent();
  const meta = config[resource];
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<Record<string, Row[]>>({ teams: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (resource !== "events" && !eventId) { setRows([]); setLoading(false); return; }
    setLoading(true); setRows([]);
    try {
      const query = resource === "events" ? "" : `?eventId=${encodeURIComponent(eventId!)}`;
      const response = await fetch(`/api/${resource}${query}`, { cache: "no-store" });
      setRows(await readResponse(response)); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao carregar dados."); }
    finally { setLoading(false); }
  }, [resource, eventId]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => rows.filter(row => JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))), [rows, search]);
  async function openForm(row: Row | null) {
    setEditing(row); setForm(initialForm(resource, row)); setFormError(null); setOpen(true);
    const sources = [...new Set(meta.fields.map(field => field.source).filter(Boolean))] as ("teams" | "groups")[];
    if (eventId && sources.length) {
      try {
        const pairs = await Promise.all(sources.map(async source => [source, await readResponse(await fetch(`/api/${source}?eventId=${encodeURIComponent(eventId)}`))] as const));
        setOptions(Object.fromEntries(pairs));
      } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Erro ao carregar opções."); }
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setFormError(null);
    const payload: Record<string, any> = { ...form, ...(resource === "events" ? {} : { eventId }) };
    for (const field of meta.fields) if (field.type === "date" && payload[field.name]) payload[field.name] = new Date(payload[field.name]).toISOString();
    try {
      const response = await fetch(`/api/${resource}${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await readResponse(response);
      setOpen(false); await load();
      if (resource === "events") { await refreshEvents(); if (!editing && result?.id) setEventId(result.id); }
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  async function remove(row: Row) {
    if (!window.confirm(`Excluir ${meta.singular} "${row.name || row.statement?.slice(0, 40) || row.id}"?`)) return;
    try {
      await readResponse(await fetch(`/api/${resource}/${row.id}${resource === "events" ? "" : `?eventId=${encodeURIComponent(eventId!)}`}`, { method: "DELETE" }));
      await load(); if (resource === "events") await refreshEvents();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível excluir."); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-blue-600">Gestão do evento</p><h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{meta.title}</h2><p className="mt-1 text-sm text-muted-foreground">{meta.description}</p></div><Button onClick={() => void openForm(null)} disabled={resource !== "events" && !eventId}><Plus size={17} />Novo {meta.singular}</Button></div>
    {(error || eventError) && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950">{error || eventError}</div>}
    {resource !== "events" && !eventId && !eventsLoading ? <Card className="p-12 text-center"><Database className="mx-auto mb-4 text-blue-500" size={34} /><h3 className="text-lg font-bold">Crie um evento para começar</h3><p className="mb-5 mt-2 text-sm text-muted-foreground">Todos os cadastros são organizados por evento.</p><Button asChild><Link href="/eventos">Ir para Eventos <ArrowRight size={16} /></Link></Button></Card> : <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 md:px-5"><div className="flex items-center gap-2"><span className="text-sm font-bold">Registros</span><Badge variant="gray">{rows.length}</Badge></div><div className="relative w-full sm:w-72"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Buscar registros" placeholder="Buscar registros..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:bg-slate-900/60"><tr>{meta.columns.map(column => <th key={column} className="px-5 py-3.5">{column}</th>)}<th className="px-5 py-3.5 text-right">Ações</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id} className="border-t border-border transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">{renderCells(resource, row).map((cell, index) => <td key={index} className="px-5 py-4">{cell}</td>)}<td className="px-5 py-4"><div className="flex justify-end gap-1">{resource === "matches" && <Button asChild variant="outline" size="sm"><Link href={`/partidas/${row.id}`}><Play size={14} />Conduzir</Link></Button>}{!(resource === "matches" && (row.session || row.bracketNode)) && <><Button variant="ghost" size="icon" aria-label="Editar" onClick={() => void openForm(row)}><Pencil size={16} /></Button><Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => void remove(row)} className="text-red-500 hover:text-red-600"><Trash2 size={16} /></Button></>}</div></td></tr>)}</tbody></table>{loading ? <p className="p-10 text-center text-sm text-muted-foreground">Carregando registros...</p> : filtered.length === 0 ? <div className="p-12 text-center"><Database size={30} className="mx-auto mb-3 text-blue-400" /><h3 className="font-bold">{search ? "Nenhum resultado" : "Nenhum registro ainda"}</h3><p className="mt-1 text-sm text-muted-foreground">{search ? "Tente outro termo de busca." : `Adicione o primeiro ${meta.singular} para começar.`}</p></div> : null}</div></Card>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title={editing ? `Editar ${meta.singular}` : `Novo ${meta.singular}`}><form onSubmit={e => void save(e)} className="space-y-4">{meta.fields.map(field => <FieldControl key={field.name} field={field} value={form[field.name]} setValue={value => setForm(current => ({ ...current, [field.name]: value }))} options={field.source ? options[field.source] || [] : []} />)}{formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">{formError}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></div></form></DialogContent></Dialog>
  </div>;
}
