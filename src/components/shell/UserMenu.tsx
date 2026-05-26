import { ChevronDown, LogOut, Repeat2, UserCog } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <div className="group relative">
      <button
        type="button"
        className="flex items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-slate-100"
        aria-haspopup="menu"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cx-blue)] text-sm font-semibold text-white">
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 md:block">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      <div className="invisible absolute right-0 top-12 z-40 w-48 rounded-md border border-[var(--cx-border)] bg-white py-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
          <UserCog className="h-4 w-4" />
          账号管理
        </button>
        <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
          <Repeat2 className="h-4 w-4" />
          切换单位/角色
        </button>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" />
            退出空间
          </button>
        </form>
      </div>
    </div>
  );
}
