import type { ReactNode } from "react";
import { clsx } from "clsx";

type BadgeProps = {
  children: ReactNode;
  tone?: "blue" | "green" | "orange" | "gray" | "red";
  className?: string;
};

const tones = {
  blue: "border-[#F0C8BE]/80 bg-[#FDF3F0] text-[#8E3425]",
  green: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  orange: "border-orange-200/80 bg-orange-50 text-orange-700",
  gray: "border-slate-200 bg-slate-50 text-slate-600",
  red: "border-red-200/80 bg-red-50 text-red-700"
};

export function Badge({ children, tone = "gray", className }: BadgeProps) {
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_1px_2px_rgba(15,23,42,0.03)]", tones[tone], className)}>
      {children}
    </span>
  );
}
