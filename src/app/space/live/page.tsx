import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LiveRoomClient } from "@/components/modules/LiveRoomClient";

export default async function LivePage() {
  const user = await requireUser();
  const sessions = await db.liveSession.findMany({
    where: { OR: [{ hostId: user.id }, { participants: { some: { userId: user.id } } }] },
    include: { participants: true, messages: true },
    orderBy: { createdAt: "desc" }
  });
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">个人直播间</h1><LiveRoomClient sessions={sessions} /></div>;
}
