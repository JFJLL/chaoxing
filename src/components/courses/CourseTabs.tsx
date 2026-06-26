import Link from "next/link";
import { clsx } from "clsx";

export function CourseTabs({ active, canTeach = false }: { active: "learned" | "taught"; canTeach?: boolean }) {
  const tabs = canTeach
    ? ([
        { key: "taught", label: "我教的课" },
        { key: "learned", label: "我学的课" }
      ] as const)
    : ([{ key: "learned", label: "我学的课" }] as const);

  return (
    <div className="flex items-center gap-8 border-b border-[var(--cx-border)]">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/space/courses?tab=${tab.key}`}
          className={clsx(
            "relative py-4 text-sm font-medium transition",
            active === tab.key ? "text-[var(--cx-blue)]" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {tab.label}
          {active === tab.key ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--cx-blue)]" /> : null}
        </Link>
      ))}
    </div>
  );
}
