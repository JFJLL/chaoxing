"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { SpaceHeader } from "@/components/shell/SpaceHeader";
import { SpaceSidebar } from "@/components/shell/SpaceSidebar";

type SpaceChromeProps = {
  user: SessionUser;
  institutionName: string;
  unreadCount: number;
  children: ReactNode;
};

function isStandaloneCourseWorkspace(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "space" || segments[1] !== "courses" || !segments[2]) {
    return false;
  }

  return true;
}

export function SpaceChrome({ user, institutionName, unreadCount, children }: SpaceChromeProps) {
  const pathname = usePathname();

  if (isStandaloneCourseWorkspace(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--cx-page)]">
      <SpaceHeader user={user} institutionName={institutionName} />
      <SpaceSidebar user={user} unreadCount={unreadCount} />
      <main className="pt-20 md:pl-[220px]">
        <div className="min-h-[calc(100vh-80px)] p-3 pb-24 sm:p-4 md:p-6 md:pb-6">
          <section className="min-h-[calc(100vh-128px)] rounded-2xl border border-white/80 bg-white p-4 shadow-panel sm:p-5">{children}</section>
        </div>
      </main>
    </div>
  );
}
