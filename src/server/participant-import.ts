import { createHash } from "node:crypto";
import { readSheet } from "read-excel-file/node";
import { parse } from "csv-parse/sync";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/resources";
import { participantIdentity, normalizeIdentity } from "@/lib/participant-key";
import { schemas } from "@/lib/validations";

const maxBytes = 5 * 1024 * 1024;
const maxRows = 5000;
type RawRow = { line: number; values: string[] };
export type ImportRow = { line: number; name: string; phaseLabel: string; phaseId: string | null; className: string; participationStatus: string; email: string; institution: string; status: "valid" | "duplicate" | "invalid"; issues: string[] };
function headerKey(value: string) { return normalizeIdentity(value).replace(/[^a-z0-9]/g, ""); }
function phaseKey(value: string) { return normalizeIdentity(value).replace(/\bfase\b/g, "").replace(/(\d+)[ao]\b/g, "$1").trim(); }
function csvDelimiter(header: string) {
  let comma = 0, semicolon = 0, quoted = false;
  for (let index = 0; index < header.length; index++) {
    if (header[index] === '"') { if (header[index + 1] === '"') index++; else quoted = !quoted; }
    else if (!quoted && header[index] === ",") comma++;
    else if (!quoted && header[index] === ";") semicolon++;
  }
  return semicolon > comma ? ";" : ",";
}
async function fileRows(file: File): Promise<RawRow[]> {
  if (file.size > maxBytes) throw new ApiError(413, "O arquivo deve ter no máximo 5 MB.");
  const suffix = file.name.toLowerCase().split(".").pop();
  if (suffix === "csv") {
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new ApiError(400, "O CSV deve estar codificado em UTF-8."); }
    const firstLine = content.split(/\r?\n/, 1)[0];
    let rows: string[][];
    try { rows = parse(content, { bom: true, delimiter: csvDelimiter(firstLine), skip_empty_lines: true, trim: true, relax_column_count: true }); }
    catch { throw new ApiError(400, "Não foi possível ler o CSV. Confira separadores e aspas."); }
    if (rows.length > maxRows + 1) throw new ApiError(413, `O limite é de ${maxRows} linhas de participantes.`);
    return rows.map((values, index) => ({ line: index + 1, values }));
  }
  if (suffix === "xlsx") {
    try {
      const data = await readSheet(Buffer.from(await file.arrayBuffer()));
      if (data.length > maxRows + 1) throw new ApiError(413, `O limite é de ${maxRows} linhas de participantes.`);
      return data.map((values, index) => ({ line: index + 1, values: values.map(value => value == null ? "" : String(value).trim()) }));
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "Não foi possível ler o XLSX. Confira se o arquivo é válido."); }
  }
  throw new ApiError(400, "Envie um arquivo .csv ou .xlsx.");
}
const headerAliases: Record<string, string[]> = {
  name: ["nome", "nomecompleto", "participante"],
  phaseLabel: ["fase", "fasedocurso", "periodo"],
  className: ["turma", "classe"],
  participationStatus: ["situacao", "situacaodeparticipacao", "status"],
  email: ["email", "correioeletronico"],
  institution: ["instituicao", "escola"]
};
function readStatus(value: string) {
  const normalized = normalizeIdentity(value);
  if (!normalized || normalized === "ativo" || normalized === "active") return "ACTIVE";
  if (normalized === "inativo" || normalized === "inactive") return "INACTIVE";
  if (normalized === "desistente" || normalized === "withdrawn") return "WITHDRAWN";
  return null;
}
export async function analyzeImport(eventId: string, file: File) {
  if (!await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })) throw new ApiError(404, "Evento não encontrado.");
  const rows = await fileRows(file);
  if (!rows.length) throw new ApiError(400, "O arquivo está vazio.");
  const header = rows[0].values.map(headerKey);
  const indexOf = (field: string) => header.findIndex(value => headerAliases[field].includes(value));
  const indexes = Object.fromEntries(Object.keys(headerAliases).map(field => [field, indexOf(field)])) as Record<string, number>;
  if (indexes.name < 0 || indexes.phaseLabel < 0) throw new ApiError(400, "O arquivo deve conter as colunas Nome e Fase.");
  const [phases, existing] = await Promise.all([
    prisma.coursePhase.findMany({ where: { eventId }, select: { id: true, name: true } }),
    prisma.participant.findMany({ where: { eventId }, select: { name: true, phaseId: true, className: true } })
  ]);
  const phaseMap = new Map<string, { id: string; name: string }[]>();
  for (const phase of phases) phaseMap.set(phaseKey(phase.name), [...(phaseMap.get(phaseKey(phase.name)) || []), phase]);
  const existingKeys = new Set(existing.filter(person => person.phaseId).map(person => participantIdentity(person.name, person.phaseId!, person.className)));
  const seen = new Set<string>();
  const preview: ImportRow[] = rows.slice(1).filter(row => row.values.some(value => value.trim())).map(row => {
    const get = (field: string) => indexes[field] < 0 ? "" : (row.values[indexes[field]] || "").trim();
    const name = get("name"), phaseLabel = get("phaseLabel"), className = get("className"), email = get("email"), institution = get("institution");
    const matches = phaseMap.get(phaseKey(phaseLabel)) || [];
    const participationStatus = readStatus(get("participationStatus"));
    const issues: string[] = [];
    if (file.name.toLowerCase().endsWith(".csv") && row.values.length !== header.length) issues.push(`Esta linha tem ${row.values.length} coluna(s), mas o cabeçalho tem ${header.length}.`);
    if (matches.length === 0) issues.push(`Fase "${phaseLabel || "em branco"}" não configurada neste evento.`);
    if (matches.length > 1) issues.push(`Fase "${phaseLabel}" ambígua. Renomeie as fases do evento.`);
    if (!participationStatus) issues.push("Situação inválida. Use Ativo, Inativo ou Desistente.");
    const input = { eventId, name, phaseId: matches[0]?.id || "", className, participationStatus: participationStatus || "ACTIVE", email, institution, teamId: null };
    const parsed = schemas.participants.safeParse(input);
    if (!parsed.success) issues.push(...parsed.error.issues.map(issue => issue.message));
    let status: ImportRow["status"] = issues.length ? "invalid" : "valid";
    if (status === "valid") {
      const key = participantIdentity(name, matches[0].id, className);
      if (existingKeys.has(key)) { status = "duplicate"; issues.push("Já cadastrado neste evento com o mesmo nome, fase e turma."); }
      else if (seen.has(key)) { status = "duplicate"; issues.push("Duplicado neste arquivo."); }
      else seen.add(key);
    }
    return { line: row.line, name, phaseLabel, phaseId: matches[0]?.id || null, className, participationStatus: participationStatus || get("participationStatus"), email, institution, status, issues };
  });
  return { rows: preview, counts: { total: preview.length, valid: preview.filter(row => row.status === "valid").length, duplicate: preview.filter(row => row.status === "duplicate").length, invalid: preview.filter(row => row.status === "invalid").length } };
}
export async function importParticipants(eventId: string, file: File) {
  const analysis = await analyzeImport(eventId, file);
  const data = analysis.rows.filter(row => row.status === "valid").map(row => ({
    eventId, name: row.name, phaseId: row.phaseId!, className: row.className || null,
    participationStatus: row.participationStatus as "ACTIVE" | "INACTIVE" | "WITHDRAWN",
    email: row.email || null, institution: row.institution || null,
    dedupeKey: createHash("sha256").update(participantIdentity(row.name, row.phaseId!, row.className)).digest("hex")
  }));
  const created = data.length ? await prisma.participant.createMany({ data, skipDuplicates: true }) : { count: 0 };
  return { imported: created.count, skipped: analysis.counts.total - created.count, counts: analysis.counts };
}
