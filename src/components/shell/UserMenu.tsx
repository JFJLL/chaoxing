"use client";

import { ChevronDown, LogOut } from "lucide-react";
import type { FormEvent } from "react";
import type { SessionUser } from "@/lib/auth";

export function UserMenu({ user }: { user: SessionUser }) {
  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { accept: "application/json" }
    });
    window.location.assign("/login");
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="cx-focus-ring cx-tactile flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-100"
        aria-haspopup="menu"
        aria-label={`${user.name}，打开用户菜单`}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cx-blue)] text-sm font-semibold text-white shadow-sm">
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 md:block">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      <div className="invisible absolute right-0 top-12 z-40 w-48 translate-y-1 rounded-xl border border-[var(--cx-border)] bg-white py-2 opacity-0 shadow-floating transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <form action="/api/auth/logout" method="post" onSubmit={handleLogout}>
          <button type="submit" className="cx-focus-ring flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" />
            退出空间
          </button>
        </form>
      </div>
    </div>
  );
}
