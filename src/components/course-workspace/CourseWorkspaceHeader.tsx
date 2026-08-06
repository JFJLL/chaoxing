import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { UserMenu } from "@/components/shell/UserMenu";

export function CourseWorkspaceHeader({ user }: { user: SessionUser }) {
  const backHref = user.role === "STUDENT" ? "/space/courses?tab=learned" : "/space/courses?tab=taught";

  return (
    <header className="sticky top-0 z-40 flex h-[72px] items-center justify-between border-b border-white/70 bg-white/90 px-4 shadow-sm backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Link href={backHref} className="cx-focus-ring cx-tactile inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[var(--cx-border-strong)] bg-white px-3 text-sm text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          <span><span className="hidden sm:inline">返回</span>课程列表</span>
        </Link>
      </div>
      <UserMenu user={user} />
    </header>
  );
}
