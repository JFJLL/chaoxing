import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export async function redeemInviteCode(user: SessionUser, codeValue: string) {
  const code = await db.inviteCode.findUnique({ where: { code: codeValue.trim() } });
  if (!code) throw new Error("邀请码不存在");
  if (code.expiresAt && code.expiresAt < new Date()) throw new Error("邀请码已过期");
  if (code.maxUses && code.usedCount >= code.maxUses) throw new Error("邀请码使用次数已达上限");

  if (code.kind === "COURSE") {
    await db.courseEnrollment.upsert({
      where: { courseId_userId: { courseId: code.targetId, userId: user.id } },
      update: {},
      create: { courseId: code.targetId, userId: user.id, progress: 0 }
    });
  } else if (code.kind === "GROUP") {
    await db.groupMember.upsert({
      where: { groupId_userId: { groupId: code.targetId, userId: user.id } },
      update: {},
      create: { groupId: code.targetId, userId: user.id }
    });
  } else if (code.kind === "DRIVE_SHARE") {
    await db.driveShare.updateMany({
      where: { fileId: code.targetId },
      data: { accessCount: { increment: 1 } }
    });
  } else if (code.kind === "LIVE_SESSION") {
    await db.liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: code.targetId, userId: user.id } },
      update: {},
      create: { sessionId: code.targetId, userId: user.id }
    });
  } else {
    throw new Error("邀请码类型不支持");
  }

  await db.inviteCode.update({
    where: { id: code.id },
    data: { usedCount: { increment: 1 } }
  });

  return code;
}
