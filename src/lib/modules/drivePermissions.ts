import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

function activeShareWhere() {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
  };
}

export async function requireDriveFileReadable(user: SessionUser, fileId: string) {
  const file = await db.driveFile.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      OR: [
        { ownerId: user.id },
        {
          shares: {
            some: activeShareWhere()
          }
        }
      ]
    },
    include: { shares: true }
  });

  if (!file) {
    throw new Error("无权访问文件");
  }

  return file;
}

export async function requireDriveFileOwner(user: SessionUser, fileId: string) {
  const file = await db.driveFile.findFirst({
    where: { id: fileId, ownerId: user.id, deletedAt: null },
    include: { shares: true }
  });

  if (!file) {
    throw new Error("无权管理文件");
  }

  return file;
}
