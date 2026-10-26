import type { Metadata } from "next";
import { LivePresentation } from "@/components/presentation/live-presentation";

export const metadata: Metadata = { title: "Quiz Bowl | Telão ao vivo", robots: { index: false, follow: false } };
export default async function PresentationPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <LivePresentation eventId={eventId} />;
}
