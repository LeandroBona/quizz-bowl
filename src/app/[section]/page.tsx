import { notFound } from "next/navigation";
import { ResourceManager } from "@/components/resources/resource-manager";
import { PresentationControl } from "@/components/presentation/presentation-control";
import { BracketView } from "@/components/bracket/bracket-view";
import { SettingsView } from "@/components/resources/settings-view";
import { ParticipantsView } from "@/components/participants/participants-view";
import { TeamsView } from "@/components/teams/teams-view";
import { DrawView } from "@/components/teams/draw-view";
import { QuestionsView } from "@/components/questions/questions-view";
import { GroupsView } from "@/components/groups/groups-view";
import type { Resource } from "@/lib/validations";
const sections: Record<string, Resource> = { eventos: "events", partidas: "matches" };
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "participantes") return <ParticipantsView />;
  if (section === "equipes") return <TeamsView />;
  if (section === "sorteio") return <DrawView />;
  if (section === "questoes") return <QuestionsView />;
  if (section === "grupos") return <GroupsView />;
  if (sections[section]) return <ResourceManager resource={sections[section]} />;
  if (section === "chaveamento") return <BracketView />;
  if (section === "placar") return <PresentationControl />;
  if (section === "configuracoes") return <SettingsView />;
  notFound();
}
