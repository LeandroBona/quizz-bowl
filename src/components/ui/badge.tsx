import { cn } from "@/lib/utils";
export function Badge({ children, variant = "blue", className }: { children: React.ReactNode; variant?: "blue" | "green" | "amber" | "gray"; className?: string }) {
  const colors = { blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300", gray: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", colors[variant], className)}>{children}</span>;
}
