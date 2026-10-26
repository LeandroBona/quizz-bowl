"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Award, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { safeReturnPath } from "@/lib/admin-paths";

function LoginForm() {
  const query = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível entrar.");
      router.replace(safeReturnPath(query.get("next"))); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível entrar."); setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#07152d] p-5 text-white"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11264b] p-7 shadow-2xl sm:p-9">
    <div className="mb-8 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500"><Award size={27}/></div><div><p className="text-2xl font-black">Quiz Bowl</p><p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-200">Acesso administrativo</p></div></div>
    <h1 className="text-2xl font-bold">Entrar no painel</h1><p className="mt-2 text-sm text-slate-300">Use sua conta de professor para gerenciar o evento e a partida ao vivo.</p>
    <form onSubmit={submit} className="mt-7 space-y-5"><label className="block text-sm font-semibold" htmlFor="login-user">Usuário<div className="relative mt-2"><UserRound className="absolute left-3 top-3 text-slate-400" size={18}/><input id="login-user" name="username" autoComplete="username" required maxLength={80} value={username} onChange={event=>setUsername(event.target.value)} className="h-11 w-full rounded-xl border border-white/20 bg-[#0a1a35] pl-11 pr-3 text-white outline-none focus:border-blue-400"/></div></label>
      <label className="block text-sm font-semibold" htmlFor="login-password">Senha<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3 text-slate-400" size={18}/><input id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-white/20 bg-[#0a1a35] pl-11 pr-3 text-white outline-none focus:border-blue-400"/></div></label>
      {error&&<p role="alert" className="rounded-lg bg-red-400/15 p-3 text-sm text-red-200">{error}</p>}
      <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-500 font-bold transition hover:bg-blue-400 disabled:opacity-60"><LogIn size={18}/>{busy?"Entrando…":"Entrar"}</button>
    </form>
    <p className="mt-6 text-center text-xs text-slate-400">O telão público continua disponível sem login.</p>
  </div></main>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#07152d] text-white">Carregando acesso…</main>}><LoginForm/></Suspense>;
}
