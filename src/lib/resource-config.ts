import type { Resource } from "@/lib/validations";
export type Field = { name: string; label: string; type?: "text" | "email" | "textarea" | "date" | "number" | "color" | "select" | "multiselect"; required?: boolean; options?: { value: string; label: string }[]; source?: "teams" | "groups" };
export type Config = { title: string; singular: string; description: string; columns: string[]; fields: Field[] };
const eventStatus = [{ value: "PLANNED", label: "Planejado" }, { value: "ACTIVE", label: "Em andamento" }, { value: "FINISHED", label: "Encerrado" }];
const matchStatus = [{ value: "SCHEDULED", label: "Agendada" }, { value: "LIVE", label: "Ao vivo" }, { value: "FINISHED", label: "Finalizada" }, { value: "CANCELLED", label: "Cancelada" }];
export const statusLabels: Record<string, string> = Object.fromEntries([...eventStatus, ...matchStatus, { value: "DRAFT", label: "Rascunho" }, { value: "READY", label: "Pronta" }, { value: "ARCHIVED", label: "Arquivada" }, { value: "EASY", label: "Fácil" }, { value: "MEDIUM", label: "Média" }, { value: "HARD", label: "Difícil" }].map(x => [x.value, x.label]));
export const config: Record<Resource, Config> = {
  events: { title: "Eventos", singular: "evento", description: "Organize as edições da competição e seus regulamentos.", columns: ["Evento", "Data", "Status"], fields: [
    { name: "name", label: "Nome do evento", required: true }, { name: "description", label: "Descrição", type: "textarea" }, { name: "venue", label: "Local" }, { name: "startsAt", label: "Início", type: "date" }, { name: "endsAt", label: "Término", type: "date" }, { name: "status", label: "Status", type: "select", options: eventStatus }, { name: "rules", label: "Regulamento", type: "textarea" }
  ] },
  participants: { title: "Participantes", singular: "participante", description: "Cadastre estudantes e associe cada um a uma equipe.", columns: ["Participante", "Instituição", "Equipe"], fields: [
    { name: "name", label: "Nome completo", required: true }, { name: "email", label: "E-mail", type: "email" }, { name: "institution", label: "Instituição" }, { name: "teamId", label: "Equipe", type: "select", source: "teams" }
  ] },
  teams: { title: "Equipes", singular: "equipe", description: "Gerencie as equipes inscritas no evento.", columns: ["Equipe", "Instituição", "Integrantes"], fields: [
    { name: "name", label: "Nome da equipe", required: true }, { name: "institution", label: "Instituição" }, { name: "color", label: "Cor", type: "color" }
  ] },
  questions: { title: "Banco de Questões", singular: "questão", description: "Prepare perguntas e respostas para cada competição.", columns: ["Questão", "Categoria", "Dificuldade", "Pontos", "Status"], fields: [
    { name: "statement", label: "Enunciado", type: "textarea", required: true }, { name: "answer", label: "Resposta esperada", type: "textarea", required: true }, { name: "category", label: "Categoria" }, { name: "difficulty", label: "Dificuldade", type: "select", options: [{ value: "EASY", label: "Fácil" }, { value: "MEDIUM", label: "Média" }, { value: "HARD", label: "Difícil" }] }, { name: "points", label: "Pontos", type: "number", required: true }, { name: "status", label: "Status", type: "select", options: [{ value: "DRAFT", label: "Rascunho" }, { value: "READY", label: "Pronta" }, { value: "ARCHIVED", label: "Arquivada" }] }
  ] },
  groups: { title: "Grupos", singular: "grupo", description: "Organize equipes por grupos e etapas.", columns: ["Grupo", "Etapa", "Equipes"], fields: [
    { name: "name", label: "Nome do grupo", required: true }, { name: "stage", label: "Etapa" }, { name: "teamIds", label: "Equipes", type: "multiselect", source: "teams" }
  ] },
  matches: { title: "Partidas", singular: "partida", description: "Agende confrontos e abra a mediação para conduzir a partida.", columns: ["Confronto", "Grupo", "Data", "Placar", "Status"], fields: [
    { name: "homeTeamId", label: "Equipe A", type: "select", source: "teams", required: true }, { name: "awayTeamId", label: "Equipe B", type: "select", source: "teams", required: true }, { name: "groupId", label: "Grupo", type: "select", source: "groups" }, { name: "round", label: "Rodada / fase" }, { name: "scheduledAt", label: "Data e horário", type: "date" }, { name: "status", label: "Status", type: "select", options: matchStatus }, { name: "homeScore", label: "Pontos equipe A", type: "number" }, { name: "awayScore", label: "Pontos equipe B", type: "number" }
  ] }
};
