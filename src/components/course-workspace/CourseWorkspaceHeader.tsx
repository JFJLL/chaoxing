import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

export function CourseWorkspaceHeader({ user }: { user: SessionUser }) {
  const backHref = user.role === "STUDENT" ? "/space/courses?tab=learned" : "/space/courses?tab=taught";

  return (
    <header className="flex h-[72px] items-center justify-between border-b border-slate-100 bg-white px-6">
      <div className="flex items-center gap-4">
        <Link href={backHref} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          返回课程列表
        </Link>
        <span className="text-xl font-semibold tracking-wide text-slate-950">易美</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50/80 py-1 pl-1 pr-3 text-sm text-slate-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2b8cff] font-medium text-white shadow-sm">
          {user.name.slice(0, 1)}
        </div>
        <span>{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
    </header>
  );
}
