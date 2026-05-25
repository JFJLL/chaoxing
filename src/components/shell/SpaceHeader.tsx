import { Search } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { Input } from "@/components/ui/Input";
import { UserMenu } from "@/components/shell/UserMenu";

type SpaceHeaderProps = {
  user: SessionUser;
  institutionName: string;
};

export function SpaceHeader({ user, institutionName }: SpaceHeaderProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-20 items-center border-b border-[var(--cx-border)] bg-white px-5 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900">{institutionName}</p>
          <p className="text-xs text-slate-500">个人空间</p>
        </div>
        <div className="hidden w-72 items-center gap-2 rounded-full border border-[var(--cx-border)] bg-slate-50 px-4 py-2 lg:flex">
          <Search className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-500">超星发现</span>
        </div>
      </div>
      <form action="/api/invite" method="post" className="mr-4 hidden items-center gap-2 md:flex">
        <Input name="code" placeholder="输入邀请码" className="w-36 rounded-full" />
        <button type="submit" className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-200">
          加入
        </button>
      </form>
      <UserMenu user={user} />
    </header>
  );
}
