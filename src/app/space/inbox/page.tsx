import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { InboxClient } from "@/components/modules/InboxClient";

type PageProps = { searchParams: Promise<{ receiverId?: string; box?: string }> };

export default async function InboxPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/space/admin");
  const params = await searchParams;
  const box = params.box === "sent" || params.box === "archived" ? params.box : "inbox";
  const boxWhere = box === "sent"
    ? { senderId: user.id, deletedBySenderAt: null }
    : box === "archived"
      ? { receiverId: user.id, archivedAt: { not: null }, deletedByReceiverAt: null }
      : { receiverId: user.id, archivedAt: null, deletedByReceiverAt: null };
  const [messages, contacts, referenceFiles] = await Promise.all([
    db.message.findMany({
      where: { AND: [boxWhere, { sender: { role: { not: "ADMIN" } } }, { receiver: { role: { not: "ADMIN" } } }] },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        receiver: { select: { id: true, name: true, role: true } },
        attachments: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.user.findMany({ where: { institutionId: user.institutionId, NOT: [{ id: user.id }, { role: "ADMIN" }] }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.driveFile.findMany({ where: { ownerId: user.id, kind: "FILE", deletedAt: null }, select: { id: true, name: true, mimeType: true, size: true }, orderBy: { updatedAt: "desc" }, take: 100 })
  ]);
  return <InboxClient messages={messages} contacts={contacts} referenceFiles={referenceFiles} activeBox={box} initialReceiverId={params.receiverId} />;
}
