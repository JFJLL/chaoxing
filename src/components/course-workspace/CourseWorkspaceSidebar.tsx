import { clsx } from "clsx";
import { courseWorkspaceNav, getCourseWorkspaceNavParent } from "@/lib/courseWorkspace/nav";
import type { CourseWorkspaceTab } from "@/types/courseWorkspace";
import { ZoviiCanvasLauncher } from "@/components/course-workspace/ZoviiCanvasLauncher";
import type { ZoviiDemoCredential } from "@/lib/zoviiDemoCredentials";

type Props = {
  course: { id: string; title: string; cover?: string | null };
  activeTab: CourseWorkspaceTab;
  canManage: boolean;
  zoviiCredential?: ZoviiDemoCredential | null;
};

type CourseNavItem = (typeof courseWorkspaceNav)[number];

function coverClass(cover?: string | null) {
  if (cover?.startsWith("cover:ai")) return "from-[#BC5B47] to-[#D07865]";
  if (cover?.startsWith("cover:tool")) return "from-emerald-500 to-teal-400";
  if (cover?.startsWith("cover:document")) return "from-sky-500 to-cyan-400";
  return "from-[#A8402F] to-[#C97B5E]";
}

function getNavigationLabel(item: CourseNavItem, canManage: boolean) {
  if (item.id === "analytics" && !canManage) return "我的学习";
  if (item.id === "drive" && !canManage) return "课程资料";
  return item.label;
}

function CourseNavLink({
  item,
  courseId,
  active,
  canManage
}: {
  item: CourseNavItem;
  courseId: string;
  active: boolean;
  canManage: boolean;
}) {
  const Icon = item.icon;
  const label = getNavigationLabel(item, canManage);

  return (
    <a
      href={`/space/courses/${courseId}/${item.hrefSegment}`}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "cx-focus-ring cx-tactile flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm lg:h-11 lg:w-full lg:gap-3",
        active
          ? "bg-[var(--cx-blue-soft)] font-medium text-[var(--cx-blue)]"
          : "font-normal text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <span
        className={clsx(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          active
            ? "bg-gradient-to-br from-[#A8402F] to-[#C97B5E] text-white shadow-sm"
            : "bg-slate-100 text-slate-500"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>{label}</span>
    </a>
  );
}

export function CourseWorkspaceSidebar({ course, activeTab, canManage, zoviiCredential = null }: Props) {
  const primaryNav = courseWorkspaceNav.filter((item) => {
    if (item.id === "drive") return false;
    if (item.id === "ai-workbench" && !canManage) return false;
    return true;
  });
  const driveNav = courseWorkspaceNav.find((item) => item.id === "drive");
  const activeParent = getCourseWorkspaceNavParent(activeTab);

  return (
    <aside className="w-full shrink-0 border-b border-[var(--cx-border)] bg-white lg:w-[248px] lg:border-b-0 lg:border-r lg:p-4">
      <div className="border-b border-slate-100 px-4 py-3 lg:hidden">
        <p className="text-xs font-medium text-[var(--cx-blue)]">当前课程</p>
        <h2 className="mt-1 truncate text-sm font-semibold text-slate-900">{course.title}</h2>
      </div>

      <div className={clsx("relative hidden overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-floating lg:block", coverClass(course.cover))}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_42%)]" />
        <p className="relative text-xs text-white/80">当前课程</p>
        <h2 className="relative mt-12 line-clamp-2 text-base font-semibold leading-6">{course.title}</h2>
      </div>

      <nav aria-label="课程工作区导航" className="cx-hide-scrollbar flex gap-2 overflow-x-auto px-4 py-3 lg:mt-4 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-0 lg:py-0">
        {primaryNav.map((item) => {
          const active = item.id === activeParent;
          return <CourseNavLink key={item.id} item={item} courseId={course.id} active={active} canManage={canManage} />;
        })}
        <ZoviiCanvasLauncher credential={zoviiCredential} />
        {driveNav ? (
          <CourseNavLink
            item={driveNav}
            courseId={course.id}
            active={activeParent === "drive"}
            canManage={canManage}
          />
        ) : null}
      </nav>
    </aside>
  );
}
