type ScheduledMatch = {
  id: string;
  group?: { name: string } | null;
  round?: string | null;
  scheduledAt?: Date | string | null;
  createdAt: Date | string;
};

const roundNumber = (round: string | null | undefined) => {
  const match = /^Rodada (\d+)$/i.exec(round ?? "");
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
};

export function compareCompetitionMatches(a: ScheduledMatch, b: ScheduledMatch) {
  if (Boolean(a.group) !== Boolean(b.group)) return a.group ? -1 : 1;
  if (a.group && b.group) {
    const round = roundNumber(a.round) - roundNumber(b.round);
    if (round) return round;
    const group = a.group.name.localeCompare(b.group.name, "pt-BR", { numeric: true });
    if (group) return group;
  }
  if (a.scheduledAt && b.scheduledAt) {
    const scheduled = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    if (scheduled) return scheduled;
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
}
