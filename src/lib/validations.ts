import { z } from "zod";

const optionalText = z.union([z.string().trim(), z.null()]).optional().transform(v => v || null);
const optionalId = z.union([z.string().min(1), z.null()]).optional().transform(v => v || null);
const optionalDate = z.union([z.iso.datetime({ offset: true }), z.literal(""), z.null()]).optional().transform(v => v || null);
const eventId = z.string().min(1, "Selecione um evento.");

export const schemas = {
  events: z.object({
    name: z.string().trim().min(2, "Informe o nome do evento."), description: optionalText,
    venue: optionalText, startsAt: optionalDate, endsAt: optionalDate,
    status: z.enum(["PLANNED", "ACTIVE", "FINISHED"]).default("PLANNED"), rules: optionalText
  }).refine(v => !v.startsAt || !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt), { message: "O término deve ocorrer após o início.", path: ["endsAt"] }),
  participants: z.object({ eventId, name: z.string().trim().min(2), phaseId: z.string().min(1, "Selecione a fase."), className: optionalText, participationStatus: z.enum(["ACTIVE", "INACTIVE", "WITHDRAWN"]).default("ACTIVE"), email: z.union([z.email(), z.literal(""), z.null()]).optional().transform(v => v || null), institution: optionalText, teamId: optionalId }),
  teams: z.object({ eventId, name: z.string().trim().min(2), institution: optionalText, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563EB") }),
  questions: z.object({ eventId, statement: z.string().trim().min(5), answer: z.string().trim().min(1), category: optionalText, difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"), points: z.coerce.number().int().min(1).max(1000), status: z.enum(["DRAFT", "READY", "ARCHIVED"]).default("DRAFT") }),
  groups: z.object({ eventId, name: z.string().trim().min(1), stage: optionalText, teamIds: z.array(z.string()).default([]) }),
  matches: z.object({ eventId, groupId: optionalId, homeTeamId: z.string().min(1), awayTeamId: z.string().min(1), scheduledAt: optionalDate, round: optionalText, status: z.enum(["SCHEDULED", "LIVE", "FINISHED", "CANCELLED"]).default("SCHEDULED"), homeScore: z.coerce.number().int().min(0), awayScore: z.coerce.number().int().min(0) }).refine(v => v.homeTeamId !== v.awayTeamId, { message: "Selecione equipes diferentes.", path: ["awayTeamId"] })
} as const;
export type Resource = keyof typeof schemas;
export const resources = Object.keys(schemas) as Resource[];
export const phaseSchema = z.object({ eventId, name: z.string().trim().min(1, "Informe o nome da fase."), sortOrder: z.coerce.number().int().min(0).default(0) });
export const teamAssignmentSchema = z.object({ eventId, teamId: optionalId });
export const drawConfigSchema = z.object({ eventId, teamCount: z.coerce.number().int().min(1).max(500), minSize: z.coerce.number().int().min(1).max(100), maxSize: z.coerce.number().int().min(1).max(100) });

const imageSchema = z.union([z.literal(""), z.null(), z.string().max(1_500_000).refine(value => /^https:\/\//i.test(value) || /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value), "Use uma URL HTTPS ou imagem PNG, JPEG, WebP ou GIF.")]).optional().transform(value => value || null);
export const questionInputSchema = z.object({
  eventId: z.string().min(1).nullable(),
  statement: z.string().trim().min(5, "Informe o enunciado."),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]),
  alternatives: z.array(z.string().trim().min(1)).max(6).default([]),
  answer: z.string().trim().min(1, "Informe a resposta correta."),
  explanation: optionalText,
  category: optionalText,
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  points: z.coerce.number().int().min(1).max(1000),
  timeSeconds: z.coerce.number().int().min(5).max(3600),
  imageUrl: imageSchema,
  isActive: z.boolean()
}).superRefine((value, context) => {
  if (value.type === "MULTIPLE_CHOICE") {
    if (value.alternatives.length < 2 || value.alternatives.length > 6) context.addIssue({ code: "custom", path: ["alternatives"], message: "Informe de 2 a 6 alternativas." });
    if (new Set(value.alternatives.map(item => item.toLocaleLowerCase("pt-BR"))).size !== value.alternatives.length) context.addIssue({ code: "custom", path: ["alternatives"], message: "As alternativas devem ser diferentes." });
    if (!value.alternatives.includes(value.answer)) context.addIssue({ code: "custom", path: ["answer"], message: "A resposta deve corresponder a uma alternativa." });
  } else if (value.type === "TRUE_FALSE") {
    if (!["TRUE", "FALSE"].includes(value.answer)) context.addIssue({ code: "custom", path: ["answer"], message: "Escolha Verdadeiro ou Falso." });
  }
});
export const questionSettingsSchema = z.object({ eventId, pointsMode: z.enum(["BY_DIFFICULTY", "FIXED"]), easyPoints: z.coerce.number().int().min(1).max(1000), mediumPoints: z.coerce.number().int().min(1).max(1000), hardPoints: z.coerce.number().int().min(1).max(1000), fixedPoints: z.coerce.number().int().min(1).max(1000), noRepeat: z.boolean() });
export const questionDrawSchema = z.object({ eventId, category: z.string().trim().optional(), difficulty: z.enum(["ALL", "EASY", "MEDIUM", "HARD"]).default("ALL"), count: z.coerce.number().int().min(1).max(100), seed: z.string().min(1).max(100).optional() });
