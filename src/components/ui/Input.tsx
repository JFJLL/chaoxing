import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "block h-10 w-full rounded-md border border-[var(--cx-border)] bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--cx-blue)] focus:ring-2 focus:ring-blue-100",
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
        "block min-h-28 w-full rounded-md border border-[var(--cx-border)] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--cx-blue)] focus:ring-2 focus:ring-blue-100",
        className
      )}
      {...props}
    />
  );
}
