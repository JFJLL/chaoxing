import Link from "next/link";
import { Bot, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import type { CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";

const colorClasses = {
  purple: "from-violet-500 to-fuchsia-500",
  blue: "from-sky-500 to-blue-600",
  pink: "from-pink-500 to-rose-500",
  orange: "from-orange-400 to-amber-500",
  green: "from-emerald-400 to-teal-500"
};

export function AiAppCard({ app, courseId }: { app: CourseAiAppDefinition; courseId: string }) {
  const body = (
    <div
      className={clsx(
        "group h-full min-h-[122px] rounded-xl border border-slate-100 bg-white p-5 text-left shadow-sm transition",
        app.enabled ? "hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md" : "opacity-80"
      )}
    >
      <div className="flex items-start gap-4">
        <span className={clsx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm", colorClasses[app.color])}>
          {app.enabled ? <Sparkles className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{app.title}</h3>
            {!app.enabled ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">暂未复刻</span> : null}
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{app.description}</p>
        </div>
      </div>
    </div>
  );

  if (!app.enabled || !app.appType) return body;

  return (
    <Link href={`/space/courses/${courseId}/ai-workbench/apps/${app.appType}`} className="block h-full">
      {body}
    </Link>
  );
}
