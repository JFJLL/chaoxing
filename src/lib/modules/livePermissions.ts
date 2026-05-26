import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export async function requireLiveParticipantOrHost(user: SessionUser, sessionId: string) {
  const session = await db.liveSession.findFirst({
    where: {
      id: sessionId,
      OR: [{ hostId: user.id }, { participants: { some: { userId: user.id } } }]
    }
  });

  if (!session) {
    throw new Error("无权访问直播");
  }

  return session;
}

export async function requireLiveHost(user: SessionUser, sessionId: string) {
  const session = await db.liveSession.findFirst({
    where: { id: sessionId, hostId: user.id }
  });

  if (!session) {
    throw new Error("无权管理直播");
  }

  return session;
}
