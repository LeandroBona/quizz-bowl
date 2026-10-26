import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
export const metadata: Metadata = { title: "Quiz Bowl | Painel administrativo", description: "Gestão de competições acadêmicas de perguntas e respostas" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR" suppressHydrationWarning><body><ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}><AppShell>{children}</AppShell></ThemeProvider></body></html>; }
