import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--cx-blue)] text-white hover:bg-[var(--cx-blue-dark)]",
  secondary: "border border-[var(--cx-border)] bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700"
};

type BaseProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
};

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;
type LinkButtonProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button({ children, variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({ children, variant = "primary", className, href, ...props }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
