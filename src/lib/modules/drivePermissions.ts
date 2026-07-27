import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { requireCourseDriveTarget } from "@/lib/courseDrive/service";

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
            some: {
              ...activeShareWhere(),
              grants: { some: { userId: user.id } }
            }
          }
        },
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
    const courses = await db.course.findMany({
      where: {
        driveRootFolderId: current.id,
        status: "ACTIVE",
        OR: [
          { ownerId: user.id },
          { enrollments: { some: { userId: user.id } } },
          ...(user.role === "ADMIN" ? [{}] : [])
        ]
      },
      select: { id: true }
    });
    for (const course of courses) {
      try {
        await requireCourseDriveTarget(user, course.id, candidate.id);
        return candidate;
      } catch {
        // Keep looking: the same file may be in a different authorized course root.
      }
    }
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
