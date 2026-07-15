import Link from "next/link";
import { clsx } from "clsx";
import { ExternalLink, Link2 } from "lucide-react";
import { courseWorkspaceNav } from "@/lib/courseWorkspace/nav";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";

type Props = {
  course: { id: string; title: string; cover?: string | null };
  activeTab: CourseWorkspaceTab;
  canManage: boolean;
};

function coverClass(cover?: string | null) {
  if (cover?.startsWith("cover:ai")) return "from-indigo-500 to-blue-400";
  if (cover?.startsWith("cover:tool")) return "from-emerald-500 to-teal-400";
  if (cover?.startsWith("cover:document")) return "from-sky-500 to-cyan-400";
  return "from-blue-500 to-cyan-400";
}

export function CourseWorkspaceSidebar({ course, activeTab, canManage }: Props) {
  const visibleNav = courseWorkspaceNav;

  return (
    <aside className="w-full shrink-0 border-r border-slate-100 bg-white p-4 lg:w-[248px]">
      <div className={clsx("overflow-hidden rounded-xl bg-gradient-to-br p-4 text-white shadow-sm", coverClass(course.cover))}>
        <div className="flex items-center justify-between text-xs text-white/85">
          <span className="inline-flex items-center gap-1">
            课程门户
            <ExternalLink className="h-3 w-3" />
          </span>
          <span className="inline-flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            链接
          </span>
        </div>
        <h2 className="mt-14 line-clamp-2 text-base font-semibold leading-6">{course.title}</h2>
      </div>

      <nav className="mt-4 space-y-1.5">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          return (
            <Link
              key={item.id}
              href={`/space/courses/${course.id}/${item.hrefSegment}`}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition",
                active ? "bg-[#eef6ff] font-medium text-[#1d63e9]" : "font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-lg",
                  item.id === "ai-workbench" ? "bg-gradient-to-br from-cyan-400 to-violet-500 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>{item.id === "ai-workbench" && !canManage ? "AI助教" : item.id === "analytics" && !canManage ? "我的学习" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
