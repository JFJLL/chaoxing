"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Cloud,
  Contact,
  FileCheck2,
  Home,
  Inbox,
  Lightbulb,
  NotebookPen,
  Radio,
  Users
} from "lucide-react";
import { clsx } from "clsx";
import type { SessionUser } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  hidden?: boolean;
  teacherOnly?: boolean;
  normalUserOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/space", label: "首页", icon: Home },
  { href: "/space/topics", label: "专题创作", icon: Lightbulb, hidden: true },
  { href: "/space/courses", label: "课程", icon: BookOpen },
  { href: "/space/inbox", label: "收件箱", icon: Inbox, normalUserOnly: true },
  { href: "/space/groups", label: "小组", icon: Users, hidden: true },
  { href: "/space/notes", label: "笔记", icon: NotebookPen },
  { href: "/space/contacts", label: "通讯录", icon: Contact, hidden: true },
  { href: "/space/drive", label: "云盘", icon: Cloud, teacherOnly: true },
  { href: "/space/plagiarism", label: "论文检测", icon: FileCheck2, hidden: true },
  { href: "/space/live", label: "个人直播间", icon: Radio, hidden: true }
];

export function SpaceSidebar({ user, unreadCount = 0 }: { user: SessionUser; unreadCount?: number }) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => !item.hidden && (!item.teacherOnly || user.role === "TEACHER" || user.role === "ADMIN") && (!item.normalUserOnly || user.role !== "ADMIN"));

  return (
    <>
      <aside className="fixed bottom-0 left-0 top-20 z-20 hidden w-[220px] overflow-hidden bg-[var(--cx-blue)] text-white shadow-xl md:block">
        <div className="border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-semibold shadow-inner">
              {user.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-xs text-white/70">{user.role === "ADMIN" ? "管理员空间" : user.role === "TEACHER" ? "教师空间" : "学习空间"}</p>
            </div>
          </div>
        </div>
        <nav aria-label="个人空间导航" className="space-y-1 p-3">
          {visibleNavItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/space" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const content = <><span className={clsx("absolute inset-y-3 left-0 w-1 rounded-r-full bg-indigo-300 transition", active ? "scale-y-100" : "scale-y-0")} /><Icon className={clsx("h-4 w-4", active ? "text-indigo-200" : "text-white/60")} aria-hidden="true" /><span className="flex-1">{item.label}</span>{item.label === "收件箱" && unreadCount > 0 ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] leading-5 text-white shadow-sm">{unreadCount}</span> : null}</>;
            const className = clsx("cx-focus-ring cx-tactile relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm", active ? "bg-[var(--cx-active)] font-medium text-white" : "text-white/80 hover:bg-white/10 hover:text-white");
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={className}>{content}</Link>;
          })}
        </nav>
      </aside>
      <nav aria-label="个人空间移动导航" className="fixed bottom-0 left-0 right-0 z-30 flex h-[72px] items-center gap-1 border-t border-[var(--cx-border)] bg-white/95 px-2 shadow-[0_-10px_30px_rgba(43,54,105,0.08)] backdrop-blur-xl md:hidden">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/space" && pathname.startsWith(item.href));
          const Icon = item.icon;
          const content = <><Icon className="h-5 w-5" aria-hidden="true" /><span className="text-[10px] font-medium leading-none">{item.label}</span>{item.label === "收件箱" && unreadCount > 0 ? <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" /> : null}</>;
          const className = clsx("cx-focus-ring cx-tactile relative flex h-14 min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl", active ? "bg-[var(--cx-blue-soft)] text-[var(--cx-blue)]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800");
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={className}>{content}</Link>;
        })}
      </nav>
    </>
  );
}
