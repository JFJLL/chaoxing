import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { InboxClient } from "@/components/modules/InboxClient";

type PageProps = {
  searchParams: Promise<{ receiverId?: string; box?: string }>;
};

export default async function InboxPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const box = params.box === "sent" || params.box === "archived" ? params.box : "inbox";
  const where =
    box === "sent"
      ? { senderId: user.id, deletedBySenderAt: null }
      : box === "archived"
        ? { receiverId: user.id, archivedAt: { not: null }, deletedByReceiverAt: null }
        : { receiverId: user.id, archivedAt: null, deletedByReceiverAt: null };
  const [messages, contacts] = await Promise.all([
    db.message.findMany({ where, include: { sender: true, receiver: true }, orderBy: { createdAt: "desc" } }),
    db.user.findMany({ where: { institutionId: user.institutionId, NOT: { id: user.id } }, orderBy: { name: "asc" } })
  ]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">收件箱</h1><InboxClient messages={messages} contacts={contacts} activeBox={box} initialReceiverId={params.receiverId} /></div>;
}
