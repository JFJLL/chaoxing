"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";

type DialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
  overlayClassName?: string;
};

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Dialog({ open, title, children, onClose, panelClassName, overlayClassName }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.hidden);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;
  const panel = (
    <div className={clsx("cx-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4", overlayClassName ?? "bg-slate-950/45 backdrop-blur-[2px]")} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={clsx("cx-dialog-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl", panelClassName)}>
        <header className="flex items-center justify-between border-b border-[var(--cx-border)] px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭" className="cx-focus-ring cx-tactile inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="h-4 w-4 shrink-0" /></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );

  // 挂载到 document.body，避免 fixed 定位被带 backdrop-filter/transform 的祖先
  // （如顶栏 backdrop-blur）限制为相对祖先定位，导致弹窗贴顶。
  if (typeof document === "undefined") return panel;
  return createPortal(panel, document.body);
}
