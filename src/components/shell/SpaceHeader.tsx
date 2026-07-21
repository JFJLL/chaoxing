import { Search } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { UserMenu } from "@/components/shell/UserMenu";

type SpaceHeaderProps = {
  user: SessionUser;
  institutionName: string;
};

export function SpaceHeader({ user, institutionName }: SpaceHeaderProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-20 items-center border-b border-white/70 bg-white/90 px-4 shadow-sm backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img src="/logo.png" alt={institutionName} className="h-10 w-auto object-contain" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-slate-700">{institutionName}</p>
            <p className="text-xs text-slate-400">个人空间</p>
          </div>
        </div>
        <div className="hidden h-10 w-72 items-center gap-2 rounded-full border border-[var(--cx-border)] bg-slate-50/80 px-4 text-slate-500 transition focus-within:border-[var(--cx-blue)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--cx-focus)] lg:flex">
          <Search className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-500">资源发现</span>
        </div>
      </div>
      <UserMenu user={user} />
    </header>
  );
}
