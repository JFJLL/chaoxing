import Link from "next/link";
import { clsx } from "clsx";
import { ExternalLink, ImagePlus } from "lucide-react";
import { courseWorkspaceNav, getCourseWorkspaceNavParent } from "@/lib/courseWorkspace/nav";
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
  const activeParent = getCourseWorkspaceNavParent(activeTab);

  return (
    <aside className="w-full shrink-0 border-r border-slate-100 bg-white p-4 lg:w-[248px]">
      <div className={clsx("overflow-hidden rounded-xl bg-gradient-to-br p-4 text-white shadow-sm", coverClass(course.cover))}>
        <p className="text-xs text-white/80">当前课程</p>
        <h2 className="mt-12 line-clamp-2 text-base font-semibold leading-6">{course.title}</h2>
      </div>

      <nav className="mt-4 space-y-1.5">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeParent;
          return (
            <Link
              key={item.id}
              href={`/space/courses/${course.id}/${item.hrefSegment}`}
              prefetch={item.id === "ai-workbench"}
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
        <a
          href="https://zovii.studio/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-normal text-slate-700 transition hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex-1">zovii智能画布</span>
          <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        </a>
      </nav>
    </aside>
  );
}
