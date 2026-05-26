import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export async function requireGroupMember(user: SessionUser, groupId: string) {
  const member = await db.groupMember.findFirst({
    where: { groupId, userId: user.id }
  });

  if (!member && user.role !== "ADMIN") {
    throw new Error("无权访问小组");
  }

  return member;
}

export async function requireGroupOwner(user: SessionUser, groupId: string) {
  const member = await db.groupMember.findFirst({
    where: { groupId, userId: user.id, role: "owner" }
  });

  if (!member && user.role !== "ADMIN") {
    throw new Error("无权管理小组");
  }

  return member;
}
