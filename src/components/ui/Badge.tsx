import type { ReactNode } from "react";
import { clsx } from "clsx";

type BadgeProps = {
  children: ReactNode;
  tone?: "blue" | "green" | "orange" | "gray" | "red";
  className?: string;
};

const tones = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  orange: "bg-orange-50 text-orange-700",
  gray: "bg-slate-100 text-slate-600",
  red: "bg-red-50 text-red-700"
};

export function Badge({ children, tone = "gray", className }: BadgeProps) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
