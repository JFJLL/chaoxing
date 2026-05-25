import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { InboxClient } from "@/components/modules/InboxClient";

export default async function InboxPage() {
  const user = await requireUser();
  const [messages, contacts] = await Promise.all([
    db.message.findMany({ where: { OR: [{ receiverId: user.id, deletedByReceiverAt: null }, { senderId: user.id, deletedBySenderAt: null }] }, include: { sender: true, receiver: true }, orderBy: { createdAt: "desc" } }),
    db.user.findMany({ where: { institutionId: user.institutionId, NOT: { id: user.id } }, orderBy: { name: "asc" } })
  ]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">收件箱</h1><InboxClient messages={messages} contacts={contacts} /></div>;
}
