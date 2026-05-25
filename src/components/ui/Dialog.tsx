"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type DialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Dialog({ open, title, children, onClose }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--cx-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <Button type="button" variant="ghost" className="h-8 w-8 px-0" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
