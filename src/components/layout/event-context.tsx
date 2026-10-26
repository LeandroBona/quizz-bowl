"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type EventOption = { id: string; name: string; status: string; description?: string | null; rules?: string | null; venue?: string | null; startsAt?: string | null; endsAt?: string | null };
type EventContextValue = { events: EventOption[]; eventId: string | null; setEventId: (id: string) => void; loading: boolean; error: string | null; refreshEvents: () => Promise<void> };
const EventContext = createContext<EventContextValue | null>(null);
export function EventProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshEvents = useCallback(async () => {
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar os eventos. Verifique a conexão com o banco.");
      const data: EventOption[] = await response.json();
      setEvents(data);
      setSelected(current => {
        const stored = current || window.localStorage.getItem("quiz-bowl-event");
        const next = data.find(event => event.id === stored)?.id || data[0]?.id || null;
        if (next) window.localStorage.setItem("quiz-bowl-event", next);
        else window.localStorage.removeItem("quiz-bowl-event");
        return next;
      });
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro ao carregar eventos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshEvents(); }, [refreshEvents]);
  const setEventId = (id: string) => { setSelected(id); window.localStorage.setItem("quiz-bowl-event", id); };
  return <EventContext.Provider value={{ events, eventId, setEventId, loading, error, refreshEvents }}>{children}</EventContext.Provider>;
}
export function useEvent() { const context = useContext(EventContext); if (!context) throw new Error("EventProvider ausente"); return context; }
