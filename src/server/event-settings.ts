import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/errors";
import { defaultTieBreakers, tieBreakerCodes } from "@/lib/group-stage";
import { contrastRatio } from "@/lib/color-contrast";

const text = z.string().trim().max(2000).nullable();
const date = z.iso.datetime({ offset: true }).nullable();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor hexadecimal como #38BDF8.");
export const eventSettingsInput = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(2).max(150), description: text, venue: z.string().trim().max(150).nullable(),
  startsAt: date, endsAt: date, rules: z.string().trim().max(20000).nullable(), status: z.enum(["PLANNED", "ACTIVE", "FINISHED"]),
  teamCount: z.number().int().min(2).max(500), minMembers: z.number().int().min(1).max(100), maxMembers: z.number().int().min(1).max(100),
  groupCount: z.number().int().min(1).max(100), teamsPerGroup: z.number().int().min(2).max(100).nullable(), qualifiersPerGroup: z.number().int().min(1).max(100),
  winPoints: z.number().int().min(0).max(1000), drawPoints: z.number().int().min(0).max(1000), lossPoints: z.number().int().min(0).max(1000), allowDraws: z.boolean(),
  tieBreakers: z.array(z.enum(tieBreakerCodes)).min(1).refine(value => new Set(value).size === value.length),
  bracketMode: z.enum(["SEEDED", "RANDOM"]), avoidSameGroup: z.boolean(), bracketTieRule: z.enum(["SCORE", "MANUAL"]),
  questionsPerMatch: z.number().int().min(1).max(100), responseSeconds: z.number().int().min(5).max(3600), wrongPenalty: z.number().int().min(0).max(1000),
  pointsMode: z.enum(["BY_DIFFICULTY", "FIXED"]), easyPoints: z.number().int().min(1).max(1000), mediumPoints: z.number().int().min(1).max(1000), hardPoints: z.number().int().min(1).max(1000), fixedPoints: z.number().int().min(1).max(1000), noRepeat: z.boolean(),
  logoUrl: z.union([z.url().max(2000).refine(value => /^https?:\/\//i.test(value)), z.literal("")]).nullable(),
  welcomeMessage: z.string().trim().max(500).nullable(), showQuestionScore: z.boolean(), showExplanation: z.boolean(), soundsEnabled: z.boolean(), accentColor: hex, backgroundColor: hex,
}).superRefine((value, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  if (value.endsAt && value.startsAt && new Date(value.endsAt) < new Date(value.startsAt)) issue("endsAt", "O término deve ocorrer após o início.");
  if (value.maxMembers < value.minMembers) issue("maxMembers", "O máximo deve ser maior ou igual ao mínimo.");
  if (value.groupCount > Math.floor(value.teamCount / 2)) issue("groupCount", "Cada grupo precisa de pelo menos duas equipes.");
  if (value.teamsPerGroup !== null && value.groupCount * value.teamsPerGroup !== value.teamCount) issue("teamsPerGroup", "A quantidade de equipes deve corresponder à estrutura dos grupos.");
  if (value.qualifiersPerGroup > (value.teamsPerGroup ?? Math.floor(value.teamCount / value.groupCount))) issue("qualifiersPerGroup", "Os classificados devem caber em todos os grupos.");
  if (contrastRatio("#FFFFFF", value.backgroundColor) < 4.5) issue("backgroundColor", "O fundo precisa manter contraste suficiente com o texto branco.");
  if (contrastRatio(value.accentColor, value.backgroundColor) < 3) issue("accentColor", "A cor de destaque precisa contrastar com o fundo.");
});
export type EventSettingsInput = z.infer<typeof eventSettingsInput>;

export const defaultEventSettings = {
  teamCount: 21, minMembers: 5, maxMembers: 6, groupCount: 7, teamsPerGroup: 3, qualifiersPerGroup: 2,
  winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: false, tieBreakers: defaultTieBreakers,
  bracketMode: "SEEDED" as const, avoidSameGroup: true, bracketTieRule: "SCORE" as const,
  questionsPerMatch: 5, responseSeconds: 30, wrongPenalty: 0,
};
export const defaultQuestionSettings = { pointsMode: "BY_DIFFICULTY" as const, easyPoints: 10, mediumPoints: 20, hardPoints: 30, fixedPoints: 10, noRepeat: true };
export const defaultPresentationSettings = { logoUrl: null, welcomeMessage: null, showQuestionScore: true, showExplanation: false, soundsEnabled: false, accentColor: "#38BDF8", backgroundColor: "#06142E" };

export async function getEventSettings(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { settings: true, questionSettings: true, presentation: true, phases: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }, groupPhases: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, confirmedAt: true, groupCount: true, teamsPerGroup: true, qualifiersPerGroup: true, tieBreakers: true } } } });
  if (!event) throw new ApiError(404, "Evento não encontrado.");
  return { event: { id: event.id, name: event.name, description: event.description, venue: event.venue, startsAt: event.startsAt, endsAt: event.endsAt, rules: event.rules, status: event.status, isDemo: event.isDemo }, settings: event.settings ?? defaultEventSettings, questionSettings: event.questionSettings ?? defaultQuestionSettings, presentation: event.presentation ?? defaultPresentationSettings, phases: event.phases, groupPhases: event.groupPhases };
}

export async function saveEventSettings(input: EventSettingsInput) {
  return prisma.$transaction(async tx => {
    const event = await tx.event.findUnique({ where: { id: input.eventId }, select: { id: true, isDemo: true } });
    if (!event) throw new ApiError(404, "Evento não encontrado.");
    if (event.isDemo) throw new ApiError(409, "O regulamento da demonstração é fixo. Crie um evento real para personalizar as regras.");
    const { eventId, name, description, venue, startsAt, endsAt, rules, status, pointsMode, easyPoints, mediumPoints, hardPoints, fixedPoints, noRepeat, logoUrl, welcomeMessage, showQuestionScore, showExplanation, soundsEnabled, accentColor, backgroundColor, ...settings } = input;
    await tx.event.update({ where: { id: eventId }, data: { name, description, venue, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null, rules, status } });
    await tx.eventSettings.upsert({ where: { eventId }, create: { eventId, ...settings, tieBreakers: settings.tieBreakers }, update: { ...settings, tieBreakers: settings.tieBreakers } });
    await tx.questionSettings.upsert({ where: { eventId }, create: { eventId, pointsMode, easyPoints, mediumPoints, hardPoints, fixedPoints, noRepeat }, update: { pointsMode, easyPoints, mediumPoints, hardPoints, fixedPoints, noRepeat } });
    await tx.eventPresentation.upsert({ where: { eventId }, create: { eventId, logoUrl: logoUrl || null, welcomeMessage, showQuestionScore, showExplanation, soundsEnabled, accentColor, backgroundColor }, update: { logoUrl: logoUrl || null, welcomeMessage, showQuestionScore, showExplanation, soundsEnabled, accentColor, backgroundColor, revision: { increment: 1 } } });
    return { saved: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
