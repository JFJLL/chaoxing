import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SpaceHeader } from "@/components/shell/SpaceHeader";
import { SpaceSidebar } from "@/components/shell/SpaceSidebar";

export default async function SpaceLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [institution, unreadCount] = await Promise.all([
    db.institution.findUnique({ where: { id: user.institutionId } }),
    db.message.count({
      where: {
        receiverId: user.id,
        readAt: null,
        archivedAt: null,
        deletedByReceiverAt: null
      }
    })
  ]);

  return (
    <div className="min-h-screen bg-[var(--cx-page)]">
      <SpaceHeader user={user} institutionName={institution?.name ?? "个人空间"} />
      <SpaceSidebar user={user} unreadCount={unreadCount} />
      <main className="pt-20 md:pl-[220px]">
        <div className="min-h-[calc(100vh-80px)] p-4 pb-24 md:p-6">
          <section className="min-h-[calc(100vh-128px)] rounded-lg bg-white p-5 shadow-panel">{children}</section>
        </div>
      </main>
    </div>
  );
}
