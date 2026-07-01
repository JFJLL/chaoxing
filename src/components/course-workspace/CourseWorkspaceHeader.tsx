import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { UserMenu } from "@/components/shell/UserMenu";

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
      <UserMenu user={user} />
    </header>
  );
}
