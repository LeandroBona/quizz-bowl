"use client";
/* eslint-disable @next/next/no-img-element -- Questões aceitam imagens enviadas como data URL ou URLs HTTPS arbitrárias. */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Copy, Eye, FileSpreadsheet, Filter, ImagePlus, Plus, Search, Settings2, Shuffle, Trash2, Upload, X } from "lucide-react";
import { useEvent } from "@/components/layout/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { responseJson } from "@/lib/api-client";
import { MatchQuestionsPanel } from "@/components/questions/match-questions-panel";

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
type Question = { id: string; eventId: string | null; statement: string; type: QuestionType; alternatives: string[]; answer: string; explanation: string | null; category: string | null; difficulty: Difficulty; points: number; timeSeconds: number; imageUrl: string | null; isActive: boolean; usedInEvent: boolean };
type Form = Omit<Question, "id" | "usedInEvent">;
type Stats = { available: number; used: number; remaining: number; noRepeat: boolean };
type Settings = { eventId: string; pointsMode: "BY_DIFFICULTY" | "FIXED"; easyPoints: number; mediumPoints: number; hardPoints: number; fixedPoints: number; noRepeat: boolean };
type Preview = { rows: { line: number; statement: string; type: string; difficulty: string; status: "valid" | "invalid" | "duplicate"; issues: string[] }[]; counts: { total: number; valid: number; invalid: number; duplicate: number } };
const typeNames: Record<QuestionType, string> = { MULTIPLE_CHOICE: "Múltipla escolha", TRUE_FALSE: "Verdadeiro ou falso", SHORT_ANSWER: "Resposta curta" };
const difficultyNames: Record<Difficulty, string> = { EASY: "Fácil", MEDIUM: "Média", HARD: "Difícil" };
function emptyForm(eventId: string): Form { return { eventId, statement: "", type: "MULTIPLE_CHOICE", alternatives: ["", ""], answer: "", explanation: "", category: "", difficulty: "MEDIUM", points: 20, timeSeconds: 30, imageUrl: null, isActive: true }; }
const defaultSettings = (eventId: string): Settings => ({ eventId, pointsMode: "BY_DIFFICULTY", easyPoints: 10, mediumPoints: 20, hardPoints: 30, fixedPoints: 10, noRepeat: true });

export function QuestionsView() {
  const { eventId } = useEvent();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");
  const [scope, setScope] = useState("");
  const [tab, setTab] = useState<"bank" | "match">("bank");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(""));
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Preview | null>(null);
  const [importError, setImportError] = useState("");
  const load = useCallback(async () => {
    if (!eventId) { setQuestions([]); setStats(null); setSettings(null); setLoading(false); return; }
    setLoading(true);
    try {
      const query = `?eventId=${encodeURIComponent(eventId)}`;
      const [items, summary, config] = await Promise.all([
        fetch(`/api/questions${query}`, { cache: "no-store" }).then(responseJson),
        fetch(`/api/questions/stats${query}`, { cache: "no-store" }).then(responseJson),
        fetch(`/api/question-settings${query}`, { cache: "no-store" }).then(responseJson)
      ]);
      setQuestions(items); setStats(summary); setSettings(config); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar o banco de questões."); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  const categories = useMemo(() => [...new Set(questions.map(question => question.category).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "pt-BR")), [questions]);
  const filtered = useMemo(() => questions.filter(question =>
    question.statement.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) &&
    (!category || question.category === category) && (!difficulty || question.difficulty === difficulty) &&
    (!type || question.type === type) && (!scope || (scope === "shared" ? question.eventId === null : question.eventId !== null))
  ), [questions, query, category, difficulty, type, scope]);
  function openForm(question: Question | null) {
    setEditing(question);
    setForm(question ? { eventId: question.eventId, statement: question.statement, type: question.type, alternatives: question.alternatives?.length ? question.alternatives : ["", ""], answer: question.answer, explanation: question.explanation, category: question.category, difficulty: question.difficulty, points: question.points, timeSeconds: question.timeSeconds, imageUrl: question.imageUrl, isActive: question.isActive } : emptyForm(eventId || ""));
    setFormError(""); setFormOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!eventId) return;
    setBusy(true); setFormError("");
    try {
      await responseJson(await fetch(`/api/questions${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, alternatives: form.type === "MULTIPLE_CHOICE" ? form.alternatives.map(item => item.trim()) : [] }) }));
      setFormOpen(false); setNotice(editing ? "Questão atualizada." : "Questão cadastrada."); await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Não foi possível salvar a questão."); }
    finally { setBusy(false); }
  }
  async function remove(question: Question) {
    if (!eventId || !window.confirm("Excluir esta questão? Esta ação não pode ser desfeita.")) return;
    try { await responseJson(await fetch(`/api/questions/${question.id}?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" })); setNotice("Questão excluída."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível excluir."); }
  }
  async function duplicate(question: Question) {
    if (!eventId) return;
    try { await responseJson(await fetch(`/api/questions/${question.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId }) })); setNotice("Cópia criada como inativa. Edite-a antes de usar."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível duplicar."); }
  }
  async function uploadImage(file: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 1_000_000) { setFormError("Escolha uma imagem PNG, JPEG, WebP ou GIF de até 1 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(current => ({ ...current, imageUrl: String(reader.result) }));
    reader.onerror = () => setFormError("Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  }
  async function saveSettings(event: React.FormEvent) {
    event.preventDefault(); if (!settings) return;
    setBusy(true); setSettingsError("");
    try { setSettings(await responseJson(await fetch("/api/question-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }))); setSettingsOpen(false); setNotice("Regras de questões atualizadas."); await load(); }
    catch (caught) { setSettingsError(caught instanceof Error ? caught.message : "Não foi possível salvar as regras."); }
    finally { setBusy(false); }
  }
  async function importFile(previewOnly: boolean) {
    if (!eventId || !file) return;
    setBusy(true); setImportError("");
    try {
      const body = new FormData(); body.set("eventId", eventId); body.set("file", file);
      const result = await responseJson(await fetch(`/api/questions/import/${previewOnly ? "preview" : "confirm"}`, { method: "POST", body }));
      if (previewOnly) setImportPreview(result);
      else { setNotice(`${result.imported} questão(ões) importada(s); ${result.skipped} ignorada(s).`); setImportOpen(false); setFile(null); setImportPreview(null); await load(); }
    } catch (caught) { setImportError(caught instanceof Error ? caught.message : "Não foi possível importar o arquivo."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-blue-600">Acervo acadêmico</p><h2 className="text-2xl font-extrabold md:text-3xl">Banco de Questões</h2><p className="mt-1 text-sm text-muted-foreground">Organize perguntas, configure pontos e selecione questões para cada partida.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!eventId} onClick={() => { setSettings(settings || defaultSettings(eventId || "")); setSettingsError(""); setSettingsOpen(true); }}><Settings2 size={16} />Regras e pontos</Button><Button variant="outline" disabled={!eventId} onClick={() => { setImportOpen(true); setImportError(""); }}><Upload size={16} />Importar</Button><Button disabled={!eventId} onClick={() => openForm(null)}><Plus size={16} />Nova questão</Button></div></div>
    {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950">{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">{error}</p>}
    {!eventId ? <Card className="p-12 text-center"><BookOpen size={30} className="mx-auto mb-3 text-blue-600" /><h3 className="font-bold">Selecione um evento</h3><p className="mt-1 text-sm text-muted-foreground">O banco compartilhado também fica disponível após selecionar um evento.</p><Button asChild className="mt-4"><Link href="/eventos">Gerenciar eventos</Link></Button></Card> : <>
      <div className="grid gap-3 sm:grid-cols-3"><Card className="p-5"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Disponíveis</p><strong className="mt-2 block text-3xl font-extrabold">{stats?.available ?? "—"}</strong></Card><Card className="p-5"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Utilizadas no evento</p><strong className="mt-2 block text-3xl font-extrabold">{stats?.used ?? "—"}</strong></Card><Card className="p-5"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Restantes sem uso</p><strong className="mt-2 block text-3xl font-extrabold text-blue-600">{stats?.remaining ?? "—"}</strong></Card></div>
      <div className="flex gap-2 border-b border-border pb-2"><Button variant={tab === "bank" ? "default" : "ghost"} onClick={() => setTab("bank")}><BookOpen size={16} />Acervo</Button><Button variant={tab === "match" ? "default" : "ghost"} onClick={() => setTab("match")}><Shuffle size={16} />Sorteio e apresentação</Button></div>
      {tab === "match" ? <MatchQuestionsPanel eventId={eventId} categories={categories} onChanged={load} /> : <>
        <Card className="p-4"><div className="grid gap-3 lg:grid-cols-[minmax(230px,1fr)_repeat(4,minmax(130px,auto))]"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Pesquisar enunciado" placeholder="Pesquisar no enunciado..." value={query} onChange={event => setQuery(event.target.value)} className="pl-9" /></div><select aria-label="Filtrar categoria" value={category} onChange={event => setCategory(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Categorias</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filtrar dificuldade" value={difficulty} onChange={event => setDifficulty(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Dificuldades</option>{Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filtrar tipo" value={type} onChange={event => setType(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Tipos</option>{Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filtrar escopo" value={scope} onChange={event => setScope(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="">Todos os bancos</option><option value="event">Este evento</option><option value="shared">Compartilhado</option></select></div></Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Filter size={15} />{filtered.length} questão(ões) encontrada(s)</div>
        {loading ? <Card className="p-10 text-center text-sm text-muted-foreground">Carregando questões...</Card> : filtered.length === 0 ? <Card className="p-10 text-center"><BookOpen size={30} className="mx-auto mb-3 text-blue-500" /><h3 className="font-bold">Nenhuma questão encontrada</h3><p className="mt-1 text-sm text-muted-foreground">Cadastre uma questão ou ajuste os filtros.</p></Card> : <div className="grid gap-4 lg:grid-cols-2">{filtered.map(question => <Card key={question.id} className="flex flex-col overflow-hidden"><div className="flex flex-1 flex-col p-5"><div className="mb-3 flex flex-wrap gap-1.5"><Badge variant="blue">{typeNames[question.type]}</Badge><Badge variant={question.difficulty === "HARD" ? "amber" : question.difficulty === "EASY" ? "green" : "gray"}>{difficultyNames[question.difficulty]}</Badge><Badge variant={question.isActive ? "green" : "gray"}>{question.isActive ? "Ativa" : "Inativa"}</Badge>{question.usedInEvent && <Badge variant="gray">Utilizada</Badge>}</div><h3 className="line-clamp-3 text-base font-bold leading-snug">{question.statement}</h3><p className="mt-2 text-xs text-muted-foreground">{question.category || "Sem categoria"} · {question.eventId ? "Evento" : "Compartilhada"} · {question.points} pts sugeridos · {question.timeSeconds}s</p></div><div className="flex flex-wrap gap-1 border-t border-border bg-slate-50 px-4 py-2 dark:bg-slate-900/40"><Button size="sm" variant="ghost" onClick={() => setPreviewQuestion(question)}><Eye size={15} />Visualizar</Button><Button size="sm" variant="ghost" onClick={() => openForm(question)}>Editar</Button><Button size="sm" variant="ghost" onClick={() => void duplicate(question)}><Copy size={15} />Duplicar</Button><Button size="sm" variant="ghost" className="text-red-600" disabled={question.usedInEvent} title={question.usedInEvent ? "Desative questões já utilizadas." : "Excluir questão"} onClick={() => void remove(question)}><Trash2 size={15} />Excluir</Button></div></Card>)}</div>}
      </>}
    </>}
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent title={editing ? "Editar questão" : "Nova questão"} className="max-h-[90vh] max-w-3xl overflow-y-auto"><form onSubmit={event => void save(event)} className="space-y-4"><div><label htmlFor="question-statement" className="mb-1 block text-sm font-semibold">Enunciado *</label><Textarea id="question-statement" value={form.statement} onChange={event => setForm({ ...form, statement: event.target.value })} required minLength={5} rows={3} /></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="question-type" className="mb-1 block text-sm font-semibold">Tipo</label><select id="question-type" value={form.type} onChange={event => { const next = event.target.value as QuestionType; setForm({ ...form, type: next, answer: "", alternatives: next === "MULTIPLE_CHOICE" ? (form.alternatives.length >= 2 ? form.alternatives : ["", ""]) : [] }); }} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">{Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label htmlFor="question-category" className="mb-1 block text-sm font-semibold">Categoria ou disciplina</label><Input id="question-category" value={form.category || ""} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Ex.: Física" /></div></div>
      {form.type === "MULTIPLE_CHOICE" && <div className="space-y-2"><div className="flex items-center justify-between"><label className="text-sm font-semibold">Alternativas (2 a 6)</label><Button type="button" size="sm" variant="outline" disabled={form.alternatives.length >= 6} onClick={() => setForm({ ...form, alternatives: [...form.alternatives, ""] })}><Plus size={14} />Adicionar</Button></div>{form.alternatives.map((alternative, index) => <div key={index} className="flex items-center gap-2"><span className="w-5 text-xs font-bold text-muted-foreground">{String.fromCharCode(65 + index)}</span><Input aria-label={`Alternativa ${String.fromCharCode(65 + index)}`} value={alternative} onChange={event => { const next = [...form.alternatives]; next[index] = event.target.value; setForm({ ...form, alternatives: next, answer: form.answer === alternative ? event.target.value : form.answer }); }} required /><Button type="button" size="icon" variant="ghost" aria-label={`Remover alternativa ${index + 1}`} disabled={form.alternatives.length <= 2} onClick={() => setForm({ ...form, alternatives: form.alternatives.filter((_, position) => position !== index), answer: form.answer === alternative ? "" : form.answer })}><X size={15} /></Button></div>)}</div>}
      <div><label htmlFor="question-answer" className="mb-1 block text-sm font-semibold">Resposta correta *</label>{form.type === "SHORT_ANSWER" ? <Input id="question-answer" value={form.answer} onChange={event => setForm({ ...form, answer: event.target.value })} placeholder="Correção manual pelo mediador" required /> : <select id="question-answer" value={form.answer} onChange={event => setForm({ ...form, answer: event.target.value })} required className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Selecione...</option>{form.type === "TRUE_FALSE" ? <><option value="TRUE">Verdadeiro</option><option value="FALSE">Falso</option></> : form.alternatives.filter(Boolean).map((alternative, index) => <option key={`${alternative}-${index}`} value={alternative}>{alternative}</option>)}</select>}</div><div><label htmlFor="question-explanation" className="mb-1 block text-sm font-semibold">Explicação da resposta</label><Textarea id="question-explanation" value={form.explanation || ""} onChange={event => setForm({ ...form, explanation: event.target.value })} rows={2} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><div><label htmlFor="question-difficulty" className="mb-1 block text-sm font-semibold">Dificuldade</label><select id="question-difficulty" value={form.difficulty} onChange={event => { const next = event.target.value as Difficulty; setForm({ ...form, difficulty: next, points: next === "EASY" ? 10 : next === "HARD" ? 30 : 20 }); }} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">{Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label htmlFor="question-points" className="mb-1 block text-sm font-semibold">Pontos sugeridos</label><Input id="question-points" type="number" min={1} max={1000} value={form.points} onChange={event => setForm({ ...form, points: Number(event.target.value) })} /></div><div><label htmlFor="question-time" className="mb-1 block text-sm font-semibold">Tempo sugerido (s)</label><Input id="question-time" type="number" min={5} max={3600} value={form.timeSeconds} onChange={event => setForm({ ...form, timeSeconds: Number(event.target.value) })} /></div></div>
      <div><label htmlFor="question-image" className="mb-1 block text-sm font-semibold">Imagem opcional</label><div className="flex flex-wrap items-center gap-2"><Input id="question-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void uploadImage(event.target.files?.[0] || null)} className="max-w-sm" />{form.imageUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, imageUrl: null })}><X size={14} />Remover</Button>}</div><Input aria-label="URL HTTPS da imagem" className="mt-2" placeholder="Ou cole uma URL HTTPS de imagem" value={form.imageUrl?.startsWith("data:") ? "" : form.imageUrl || ""} onChange={event => setForm({ ...form, imageUrl: event.target.value })} />{form.imageUrl && <p className="mt-1 text-xs text-muted-foreground"><ImagePlus size={13} className="mr-1 inline" />Imagem anexada à questão.</p>}</div>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-900 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.eventId === null} disabled={!!editing} onChange={event => setForm({ ...form, eventId: event.target.checked ? null : eventId || "" })} className="accent-blue-600" />Disponível no banco compartilhado</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} className="accent-blue-600" />Questão ativa</label></div>{formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button disabled={busy}>{busy ? "Salvando..." : "Salvar questão"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!previewQuestion} onOpenChange={open => { if (!open) setPreviewQuestion(null); }}><DialogContent title="Pré-visualização da questão" className="max-w-2xl"><div className="space-y-4"><div className="flex gap-2"><Badge variant="blue">{previewQuestion && typeNames[previewQuestion.type]}</Badge><Badge variant="gray">{previewQuestion && difficultyNames[previewQuestion.difficulty]}</Badge></div><h3 className="text-lg font-bold leading-snug">{previewQuestion?.statement}</h3>{previewQuestion?.imageUrl && <img src={previewQuestion.imageUrl} alt="Imagem da questão" className="max-h-64 w-full rounded-xl object-contain" />}{previewQuestion?.type === "MULTIPLE_CHOICE" && <div className="space-y-2">{previewQuestion.alternatives.map((alternative, index) => <div key={index} className="rounded-lg border border-border px-4 py-2 text-sm"><strong className="mr-2 text-blue-600">{String.fromCharCode(65 + index)}.</strong>{alternative}</div>)}</div>}{previewQuestion?.type === "TRUE_FALSE" && <div className="flex gap-2"><Badge variant="gray">Verdadeiro</Badge><Badge variant="gray">Falso</Badge></div>}<div className="rounded-xl bg-blue-50 p-4 text-sm dark:bg-blue-950"><strong>Resposta: {previewQuestion?.answer === "TRUE" ? "Verdadeiro" : previewQuestion?.answer === "FALSE" ? "Falso" : previewQuestion?.answer}</strong>{previewQuestion?.explanation && <p className="mt-2 text-muted-foreground">{previewQuestion.explanation}</p>}</div><p className="text-xs text-muted-foreground">Prévia administrativa · {previewQuestion?.points} pontos sugeridos · {previewQuestion?.timeSeconds}s</p></div></DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent title="Regras e pontuação"><form onSubmit={event => void saveSettings(event)} className="space-y-4"><p className="text-sm text-muted-foreground">Estes valores são sugestões das questões. Na mediação da partida, o mediador atribui 0, 5 ou 10 pontos por resposta.</p><div><label htmlFor="points-mode" className="mb-1 block text-sm font-semibold">Forma de pontuar</label><select id="points-mode" value={settings?.pointsMode || "BY_DIFFICULTY"} onChange={event => setSettings(current => current && ({ ...current, pointsMode: event.target.value as Settings["pointsMode"] }))} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="BY_DIFFICULTY">Por dificuldade</option><option value="FIXED">Valor fixo</option></select></div>{settings?.pointsMode === "FIXED" ? <div><label htmlFor="fixed-points" className="mb-1 block text-sm font-semibold">Pontos por questão</label><Input id="fixed-points" type="number" min={1} max={1000} value={settings.fixedPoints} onChange={event => setSettings({ ...settings, fixedPoints: Number(event.target.value) })} /></div> : <div className="grid gap-3 sm:grid-cols-3">{([ ["easyPoints", "Fácil"], ["mediumPoints", "Média"], ["hardPoints", "Difícil"] ] as const).map(([field, label]) => <div key={field}><label htmlFor={field} className="mb-1 block text-sm font-semibold">{label}</label><Input id={field} type="number" min={1} max={1000} value={settings?.[field] ?? 0} onChange={event => setSettings(current => current && ({ ...current, [field]: Number(event.target.value) }))} /></div>)}</div>}<label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><input type="checkbox" checked={settings?.noRepeat ?? true} onChange={event => setSettings(current => current && ({ ...current, noRepeat: event.target.checked }))} className="mt-1 accent-blue-600" /><span><strong className="block">Não repetir questões no evento</strong><span className="text-muted-foreground">Quando ativa, questões utilizadas em qualquer partida deste evento não entram em novos sorteios.</span></span></label>{settingsError && <p role="alert" className="text-sm text-red-600">{settingsError}</p>}<div className="flex justify-end"><Button disabled={busy}>Salvar regras</Button></div></form></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent title="Importar questões" className="max-h-[90vh] max-w-4xl overflow-y-auto"><div className="space-y-4"><div className="rounded-xl bg-blue-50 p-4 text-sm dark:bg-blue-950"><p className="font-bold"><FileSpreadsheet size={17} className="mr-2 inline" />CSV ou XLSX · até 5 MB</p><p className="mt-2 text-muted-foreground">Colunas obrigatórias: Enunciado, Tipo e Resposta. Opcionais: Alternativas (separadas por |), Explicação, Categoria, Dificuldade, Pontos, Tempo, Imagem, Escopo e Situação. Para múltipla escolha, a resposta pode ser a letra A–F ou o texto da alternativa.</p></div><Input aria-label="Selecionar arquivo de questões" type="file" accept=".csv,.xlsx" onChange={event => { setFile(event.target.files?.[0] || null); setImportPreview(null); setImportError(""); }} /><Button variant="outline" disabled={!file || busy} onClick={() => void importFile(true)}><Eye size={16} />Pré-visualizar</Button>{importPreview && <><div className="flex flex-wrap gap-2"><Badge variant="gray">{importPreview.counts.total} linhas</Badge><Badge variant="green">{importPreview.counts.valid} válidas</Badge><Badge variant="amber">{importPreview.counts.duplicate} duplicadas</Badge><Badge variant="gray">{importPreview.counts.invalid} inválidas</Badge></div><div className="max-h-72 overflow-auto rounded-xl border border-border"><table className="w-full min-w-[600px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-900"><tr>{["Linha", "Enunciado", "Tipo", "Dificuldade", "Resultado"].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{importPreview.rows.map(row => <tr key={row.line} className="border-t border-border"><td className="px-3 py-2">{row.line}</td><td className="max-w-sm truncate px-3 py-2 font-semibold">{row.statement || "—"}</td><td className="px-3 py-2">{typeNames[row.type as QuestionType] || row.type}</td><td className="px-3 py-2">{difficultyNames[row.difficulty as Difficulty] || row.difficulty}</td><td className="px-3 py-2"><Badge variant={row.status === "valid" ? "green" : row.status === "duplicate" ? "amber" : "gray"}>{row.status === "valid" ? "Válida" : row.status === "duplicate" ? "Duplicada" : "Inválida"}</Badge>{row.issues.length > 0 && <p className="mt-1 text-red-600">{row.issues.join(" ")}</p>}</td></tr>)}</tbody></table></div><div className="flex justify-end"><Button disabled={!importPreview.counts.valid || busy} onClick={() => void importFile(false)}><Upload size={16} />Importar {importPreview.counts.valid} válida(s)</Button></div></>}{importError && <p role="alert" className="text-sm text-red-600">{importError}</p>}</div></DialogContent></Dialog>
  </div>;
}
