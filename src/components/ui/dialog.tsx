"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export function DialogContent({ children, className, title }: { children: React.ReactNode; className?: string; title: string }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px]" /><DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl", className)}><div className="mb-5 flex items-start justify-between gap-4"><DialogPrimitive.Title className="text-xl font-bold">{title}</DialogPrimitive.Title><DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X size={18} /></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal>;
}
