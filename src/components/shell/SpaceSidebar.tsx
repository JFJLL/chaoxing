"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
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
};

const navItems: NavItem[] = [
  { href: "/space", label: "首页", icon: Home },
  { href: "/space/topics", label: "专题创作", icon: Lightbulb, hidden: true },
  { href: "/space/courses", label: "课程", icon: BookOpen },
  { href: "/space/inbox", label: "收件箱", icon: Inbox },
  { href: "/space/groups", label: "小组", icon: Users, hidden: true },
  { href: "/space/notes", label: "笔记", icon: NotebookPen },
  { href: "/space/contacts", label: "通讯录", icon: Contact, hidden: true },
  { href: "/space/drive", label: "云盘", icon: Cloud, teacherOnly: true },
  { href: "/space/plagiarism", label: "论文检测", icon: FileCheck2, hidden: true },
  { href: "/space/live", label: "个人直播间", icon: Radio, hidden: true }
];

export function SpaceSidebar({ user, unreadCount = 0 }: { user: SessionUser; unreadCount?: number }) {
  const pathname = usePathname();
  const visibleNavItems = navItems.filter((item) => !item.hidden && (!item.teacherOnly || user.role === "TEACHER" || user.role === "ADMIN"));

  return (
    <>
      <aside className="fixed bottom-0 left-0 top-20 z-20 hidden w-[220px] bg-[var(--cx-blue)] text-white md:block">
        <div className="border-b border-white/15 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-semibold">
              {user.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-xs text-white/70">{user.role === "TEACHER" ? "教师空间" : "学习空间"}</p>
            </div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {visibleNavItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/space" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const content = <><Icon className="h-4 w-4" aria-hidden="true" /><span className="flex-1">{item.label}</span>{item.label === "收件箱" && unreadCount > 0 ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] leading-5 text-white">{unreadCount}</span> : null}</>;
            const className = clsx("flex h-11 items-center gap-3 rounded-md px-3 text-sm transition", active ? "bg-[var(--cx-active)] text-white" : "text-white/85 hover:bg-white/10 hover:text-white");
            return <Link key={item.href} href={item.href} className={className}>{content}</Link>;
          })}
        </nav>
        <button
          type="button"
          className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/80"
          aria-label="收起侧边栏"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </aside>
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center gap-1 overflow-x-auto border-t border-[var(--cx-border)] bg-white px-2 shadow-lg md:hidden">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/space" && pathname.startsWith(item.href));
          const Icon = item.icon;
          const content = <><Icon className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{item.label}</span>{item.label === "收件箱" && unreadCount > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" /> : null}</>;
          const className = clsx("relative flex h-11 min-w-11 items-center justify-center rounded-md", active ? "bg-blue-50 text-[var(--cx-blue)]" : "text-slate-500");
          return <Link key={item.href} href={item.href} title={item.label} className={className}>{content}</Link>;
        })}
      </nav>
    </>
  );
}
