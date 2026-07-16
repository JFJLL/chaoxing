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
        ...(user.role === "ADMIN" ? [{}] : []),
        { ownerId: user.id },
        {
          shares: {
            some: activeShareWhere()
          }
        },
        {
          resources: {
            some: {
              course: {
                status: "ACTIVE",
                enrollments: { some: { userId: user.id } }
              }
            }
          }
        }
      ]
    },
    include: { shares: true }
  });

  if (file) return file;

  const candidate = await db.driveFile.findFirst({ where: { id: fileId, deletedAt: null }, include: { shares: true } });
  if (!candidate) throw new Error("无权访问文件");
  let current: { id: string; parentId: string | null; deletedAt: Date | null } | null = candidate;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const course = await db.course.findFirst({
      where: {
        copilotFolderId: current.id,
        status: "ACTIVE",
        OR: [
          { ownerId: user.id },
          { enrollments: { some: { userId: user.id } } },
          ...(user.role === "ADMIN" ? [{}] : [])
        ]
      },
      select: { id: true }
    });
    if (course) return candidate;
    if (!current.parentId) break;
    current = await db.driveFile.findFirst({
      where: { id: current.parentId, deletedAt: null },
      select: { id: true, parentId: true, deletedAt: true }
    });
  }

  throw new Error("无权访问文件");
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
