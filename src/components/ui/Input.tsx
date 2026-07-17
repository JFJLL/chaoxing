import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "block h-10 w-full rounded-lg border border-[var(--cx-border-strong)] bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--cx-blue)] focus:ring-4 focus:ring-[var(--cx-focus)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "block min-h-28 w-full rounded-lg border border-[var(--cx-border-strong)] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--cx-blue)] focus:ring-4 focus:ring-[var(--cx-focus)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "block h-10 w-full rounded-lg border border-[var(--cx-border-strong)] bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[var(--cx-blue)] focus:ring-4 focus:ring-[var(--cx-focus)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
}
