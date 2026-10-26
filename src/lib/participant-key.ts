export function normalizeIdentity(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

// Sem matrícula institucional, a identidade de importação é nome + fase + turma.
export function participantIdentity(name: string, phaseId: string, className?: string | null) {
  return `${normalizeIdentity(name)}|${phaseId}|${normalizeIdentity(className || "")}`;
}
