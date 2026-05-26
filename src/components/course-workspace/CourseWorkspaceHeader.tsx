import { ChevronDown } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

export function CourseWorkspaceHeader({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-[72px] items-center justify-between border-b border-slate-100 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 text-lg font-semibold text-white">泛</div>
        <span className="text-xl font-semibold text-slate-900">泛雅</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 py-1 pl-1 pr-3 text-sm text-slate-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 font-medium text-white">
          {user.name.slice(0, 1)}
        </div>
        <span>{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
    </header>
  );
}
