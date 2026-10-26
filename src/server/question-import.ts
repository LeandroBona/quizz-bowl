import { readSheet } from "read-excel-file/node";
import { parse } from "csv-parse/sync";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { questionInputSchema } from "@/lib/validations";
import { questionData, questionIdentity, type QuestionInput, assertEvent } from "@/server/question-bank";

type FileRow = { line: number; values: string[] };
export type QuestionImportRow = { line: number; statement: string; type: string; category: string; difficulty: string; status: "valid" | "invalid" | "duplicate"; issues: string[]; input: QuestionInput | null };
const maxRows = 5000;
const aliases: Record<string, string[]> = {
  statement: ["enunciado", "pergunta", "questao"], type: ["tipo", "tipodequestao"], alternatives: ["alternativas", "opcoes"],
  answer: ["resposta", "respostacorreta", "gabarito"], explanation: ["explicacao", "justificativa"],
  category: ["categoria", "disciplina"], difficulty: ["dificuldade", "nivel"], points: ["pontos", "pontuacao"],
  timeSeconds: ["tempo", "temposegundos"], imageUrl: ["imagem", "urlimagem"], scope: ["escopo", "disponibilidade"],
  isActive: ["situacao", "status"]
};
function normalize(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR"); }
function key(value: string) { return normalize(value).replace(/[^a-z0-9]/g, ""); }
function readType(value: string) {
  const normalized = key(value);
  if (["multiplaescolha", "multipla", "multiplechoice"].includes(normalized)) return "MULTIPLE_CHOICE";
  if (["verdadeirooufalso", "verdadeirofalso", "vf", "truefalse"].includes(normalized)) return "TRUE_FALSE";
  if (["respostacurta", "curta", "shortanswer"].includes(normalized)) return "SHORT_ANSWER";
  return value;
}
function readDifficulty(value: string) {
  const normalized = key(value);
  if (["facil", "easy"].includes(normalized)) return "EASY";
  if (["medio", "media", "medium"].includes(normalized)) return "MEDIUM";
  if (["dificil", "hard"].includes(normalized)) return "HARD";
  return value || "MEDIUM";
}
function readAnswer(value: string, type: string, alternatives: string[]) {
  if (type === "TRUE_FALSE") {
    if (["verdadeiro", "v", "true"].includes(key(value))) return "TRUE";
    if (["falso", "f", "false"].includes(key(value))) return "FALSE";
  }
  if (type === "MULTIPLE_CHOICE" && /^[A-Fa-f]$/.test(value)) return alternatives[value.toUpperCase().charCodeAt(0) - 65] || value;
  return value;
}
function delimiter(firstLine: string) {
  let semicolon = 0, comma = 0, quoted = false;
  for (let index = 0; index < firstLine.length; index++) {
    if (firstLine[index] === '"') { if (firstLine[index + 1] === '"') index++; else quoted = !quoted; }
    else if (!quoted && firstLine[index] === ";") semicolon++;
    else if (!quoted && firstLine[index] === ",") comma++;
  }
  return semicolon > comma ? ";" : ",";
}
async function readRows(file: File): Promise<FileRow[]> {
  if (file.size > 5 * 1024 * 1024) throw new ApiError(413, "O arquivo deve ter no máximo 5 MB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new ApiError(400, "O CSV precisa estar em UTF-8."); }
    let rows: string[][];
    try { rows = parse(content, { bom: true, delimiter: delimiter(content.split(/\r?\n/, 1)[0]), skip_empty_lines: true, trim: true, relax_column_count: true }); }
    catch { throw new ApiError(400, "Não foi possível ler o CSV. Confira as aspas e o separador."); }
    if (rows.length > maxRows + 1) throw new ApiError(413, `O limite é de ${maxRows} questões por arquivo.`);
    return rows.map((values, index) => ({ line: index + 1, values }));
  }
  if (extension === "xlsx") {
    try {
      const rows = await readSheet(Buffer.from(await file.arrayBuffer()));
      if (rows.length > maxRows + 1) throw new ApiError(413, `O limite é de ${maxRows} questões por arquivo.`);
      return rows.map((values, index) => ({ line: index + 1, values: values.map(value => value == null ? "" : String(value).trim()) }));
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "Não foi possível ler o XLSX."); }
  }
  throw new ApiError(400, "Envie um arquivo CSV ou XLSX.");
}
export async function analyzeQuestionImport(eventId: string, file: File) {
  await assertEvent(eventId);
  const rows = await readRows(file);
  if (!rows.length) throw new ApiError(400, "O arquivo está vazio.");
  const headers = rows[0].values.map(key);
  const indexes = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex(header => names.includes(header))])) as Record<string, number>;
  if (indexes.statement < 0 || indexes.type < 0 || indexes.answer < 0) throw new ApiError(400, "Inclua as colunas Enunciado, Tipo e Resposta.");
  const existing = await prisma.question.findMany({ where: { OR: [{ eventId }, { eventId: null }] }, select: { eventId: true, statement: true, type: true } });
  const existingKeys = new Set(existing.map(item => questionIdentity(item.eventId, item.type, item.statement)));
  const seen = new Set<string>();
  const result: QuestionImportRow[] = rows.slice(1).filter(row => row.values.some(value => value.trim())).map(row => {
    const get = (field: string) => indexes[field] < 0 ? "" : (row.values[indexes[field]] || "").trim();
    const statement = get("statement"), type = readType(get("type")), category = get("category"), difficulty = readDifficulty(get("difficulty"));
    const alternatives = get("alternatives").split("|").map(value => value.trim()).filter(Boolean);
    const pointsDefault = difficulty === "EASY" ? 10 : difficulty === "HARD" ? 30 : 20;
    const scope = key(get("scope"));
    const input = { eventId: ["compartilhado", "compartilhada", "shared", "global"].includes(scope) ? null : eventId,
      statement, type, alternatives, answer: readAnswer(get("answer"), type, alternatives), explanation: get("explanation"), category,
      difficulty, points: get("points") || pointsDefault, timeSeconds: get("timeSeconds") || 30,
      imageUrl: get("imageUrl"), isActive: !["inativa", "inativo", "inactive"].includes(key(get("isActive"))) };
    const parsed = questionInputSchema.safeParse(input);
    const issues = parsed.success ? [] : parsed.error.issues.map(issue => issue.message);
    if (file.name.toLowerCase().endsWith(".csv") && row.values.length !== headers.length) issues.push(`A linha tem ${row.values.length} colunas; o cabeçalho tem ${headers.length}.`);
    if (scope && !["evento", "event", "compartilhado", "compartilhada", "shared", "global"].includes(scope)) issues.push("Escopo inválido. Use Evento ou Compartilhado.");
    const statusValue = key(get("isActive"));
    if (statusValue && !["ativa", "ativo", "active", "inativa", "inativo", "inactive"].includes(statusValue)) issues.push("Situação inválida. Use Ativa ou Inativa.");
    let status: QuestionImportRow["status"] = issues.length ? "invalid" : "valid";
    if (status === "valid" && parsed.success) {
      const identity = questionIdentity(parsed.data.eventId, parsed.data.type, parsed.data.statement);
      if (existingKeys.has(identity) || seen.has(identity)) { status = "duplicate"; issues.push("Questão já cadastrada neste banco ou repetida no arquivo."); }
      else seen.add(identity);
    }
    return { line: row.line, statement, type, category, difficulty, status, issues, input: parsed.success && status === "valid" ? parsed.data : null };
  });
  return { rows: result, counts: { total: result.length, valid: result.filter(row => row.status === "valid").length, duplicate: result.filter(row => row.status === "duplicate").length, invalid: result.filter(row => row.status === "invalid").length } };
}
export async function importQuestions(eventId: string, file: File) {
  const analysis = await analyzeQuestionImport(eventId, file);
  const data = analysis.rows.flatMap(row => row.input ? [questionData(row.input)] : []);
  const created = data.length ? await prisma.question.createMany({ data, skipDuplicates: true }) : { count: 0 };
  return { imported: created.count, skipped: analysis.counts.total - created.count, counts: analysis.counts };
}
