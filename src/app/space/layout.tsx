import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SpaceChrome } from "@/components/shell/SpaceChrome";

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
    <SpaceChrome user={user} institutionName={institution?.name ?? "个人空间"} unreadCount={unreadCount}>
      {children}
    </SpaceChrome>
  );
}
