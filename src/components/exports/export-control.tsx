"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const datasets = [
  ["participants", "Participantes"], ["teams", "Equipes"], ["groups", "Grupos"],
  ["standings", "Classificação"], ["matches", "Resultados"], ["bracket", "Chaveamento"],
] as const;
export function ExportControl({ eventId }: { eventId: string }) {
  return <div className="space-y-2 text-sm"><p className="text-muted-foreground">Os arquivos incluem somente dados do evento selecionado.</p>{datasets.map(([dataset, label]) => <div key={dataset} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"><span className="font-medium">{label}</span><div className="flex gap-2">{(["csv", "pdf"] as const).map(format => <Button key={format} asChild size="sm" variant="outline"><a href={`/api/exports?eventId=${encodeURIComponent(eventId)}&dataset=${dataset}&format=${format}`} download><Download size={13}/>{format.toUpperCase()}</a></Button>)}</div></div>)}</div>;
}
