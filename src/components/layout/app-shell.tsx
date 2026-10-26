"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Award, Braces, CalendarDays, ChevronDown, CircleHelp, ClipboardList, GitBranch, LayoutDashboard, LogOut, Menu, MonitorPlay, Moon, Settings2, Shield, Shuffle, Sun, Swords, Users, UsersRound, X } from "lucide-react";
import { useTheme } from "next-themes";
import { EventProvider, useEvent } from "@/components/layout/event-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/participantes", label: "Participantes", icon: Users },
  { href: "/equipes", label: "Equipes", icon: UsersRound },
  { href: "/sorteio", label: "Sorteio de Equipes", icon: Shuffle },
  { href: "/questoes", label: "Banco de Questões", icon: ClipboardList },
  { href: "/grupos", label: "Grupos", icon: Braces },
  { href: "/chaveamento", label: "Chaveamento", icon: GitBranch },
  { href: "/partidas", label: "Partidas", icon: Swords },
  { href: "/placar", label: "Placar e Telão", icon: MonitorPlay },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 }
];
function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { events, eventId, setEventId, loading } = useEvent();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [adminName, setAdminName] = useState("");
  useEffect(()=>{void fetch("/api/auth/me",{cache:"no-store"}).then(response=>response.ok?response.json():null).then(data=>{if(data?.user?.name)setAdminName(data.user.name);}).catch(()=>{});},[]);
  async function signOut() {
    setSigningOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { router.replace("/login"); router.refresh(); }
  }
  const current = nav.find(item => item.href === pathname || (item.href === "/partidas" && pathname.startsWith("/partidas/")))?.label || "Quiz Bowl";
  return <div className="min-h-screen bg-background text-foreground">
    {open && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)} />}
    <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-slate-800 bg-[#0b1730] text-slate-300 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-[78px] items-center justify-between border-b border-white/10 px-6">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/30"><Award size={24} strokeWidth={2.4} /></span><span className="leading-tight"><strong className="block text-lg tracking-tight text-white">Quiz Bowl</strong><small className="text-[10px] font-semibold uppercase tracking-[.23em] text-blue-300">Competition hub</small></span></Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
      </div>
      <div className="px-4 pt-7"><p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Menu principal</p><nav className="space-y-1">{nav.map(item => { const Icon = item.icon; const active = pathname === item.href || (item.href === "/partidas" && pathname.startsWith("/partidas/")); return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors", active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "hover:bg-white/8 hover:text-white")}><Icon size={18} strokeWidth={active ? 2.3 : 1.9} />{item.label}</Link>; })}</nav></div>
      <div className="mt-auto p-4"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Shield size={16} className="text-blue-400" />Área administrativa</div><p className="text-xs leading-relaxed text-slate-400">Gerencie cada etapa da sua competição em um só lugar.</p></div><button onClick={()=>void signOut()} disabled={signingOut} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"><LogOut size={17}/>{signingOut?"Saindo…":"Sair da conta"}</button><div className="mt-2 flex items-center gap-2 px-2 text-xs text-slate-500"><CircleHelp size={15} /> Quiz Bowl · painel v0.1</div></div>
    </aside>
    <div className="lg:pl-[258px]">
      <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between gap-4 border-b border-border bg-card/95 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"><Menu size={22} /></button><div><p className="text-[11px] font-semibold uppercase tracking-[.13em] text-muted-foreground">Painel administrativo</p><h1 className="text-lg font-bold leading-tight md:text-xl">{current}</h1></div></div><div className="flex items-center gap-2 md:gap-3"><div className="relative hidden sm:block"><select aria-label="Evento selecionado" disabled={loading || events.length === 0} value={eventId || ""} onChange={e => setEventId(e.target.value)} className="h-10 max-w-[220px] appearance-none rounded-lg border border-border bg-card py-2 pl-3 pr-9 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"><option value="">{loading ? "Carregando..." : "Nenhum evento"}</option>{events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" /></div><button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Alternar tema" className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-slate-100 dark:hover:bg-slate-800"><Sun size={18} className="hidden dark:block" /><Moon size={18} className="dark:hidden" /></button><span title={adminName||"Conta de professor"} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#10244b] text-xs font-bold text-white">{adminName?adminName.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase():"QB"}</span></div></header>
      <main className="mx-auto max-w-[1600px] p-5 md:p-8"><div className="mb-5 sm:hidden"><label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label><select value={eventId || ""} onChange={e => setEventId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="">Selecione um evento</option>{events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></div>{children}</main>
    </div>
  </div>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/telao/") || pathname === "/login") return <>{children}</>;
  return <EventProvider><ShellContent>{children}</ShellContent></EventProvider>;
}
