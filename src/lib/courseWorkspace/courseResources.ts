import { createHash } from "crypto";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCoursePurposeFolder } from "@/lib/courseDrive/service";
import { requireDriveFileOwner } from "@/lib/modules/drivePermissions";
import {
  deleteDriveFileFromStorage,
  readDriveFileBytes,
  storeDriveFile
} from "@/lib/modules/driveFiles";
import { storeDriveUpload } from "@/lib/copilot/files";

const sourceMarker = (driveFileId: string) => `drive-source:${driveFileId}`;

async function publishResourceRecord(input: {
  courseId: string;
  userId: string;
  driveFileId: string;
  title: string;
  url?: string;
}) {
  return db.$transaction(async (tx) => {
    await tx.courseDriveAccessRule.upsert({
      where: {
        courseId_driveFileId: {
          courseId: input.courseId,
          driveFileId: input.driveFileId
        }
      },
      create: {
        courseId: input.courseId,
        driveFileId: input.driveFileId,
        access: "ALLOW",
        updatedById: input.userId
      },
      update: {
        access: "ALLOW",
        updatedById: input.userId
      }
    });
    return tx.resource.create({
      data: {
        courseId: input.courseId,
        title: input.title,
        type: "drive",
        driveFileId: input.driveFileId,
        url: input.url
      },
      include: { driveFile: true }
    });
  });
}

export async function publishCourseResourceUpload(
  user: SessionUser,
  courseId: string,
  file: File
) {
  const folder = await ensureCoursePurposeFolder(user, courseId, "COURSE_RESOURCES");
  const driveFile = await storeDriveUpload({
    ownerId: folder.ownerId,
    parentId: folder.id,
    file
  });
  try {
    return await publishResourceRecord({
      courseId,
      userId: user.id,
      driveFileId: driveFile.id,
      title: driveFile.name
    });
  } catch (error) {
    await db.driveFile.delete({ where: { id: driveFile.id } }).catch(() => undefined);
    await deleteDriveFileFromStorage(driveFile).catch(() => undefined);
    throw error;
  }
}

export async function publishExistingDriveFileToCourse(
  user: SessionUser,
  courseId: string,
  sourceDriveFileId: string
) {
  const source = await requireDriveFileOwner(user, sourceDriveFileId);
  if (source.kind !== "file" || !source.path) throw new Error("只能添加有效文件到课程资料");

  const marker = sourceMarker(source.id);
  const existing = await db.resource.findFirst({
    where: {
      courseId,
      url: marker,
      driveFile: { deletedAt: null }
    },
    include: { driveFile: true }
  });
  if (existing) return { resource: existing, alreadyAttached: true };

  const folder = await ensureCoursePurposeFolder(user, courseId, "COURSE_RESOURCES");
  const bytes = await readDriveFileBytes(source);
  const path = await storeDriveFile({
    ownerId: folder.ownerId,
    fileName: source.name,
    bytes,
    mimeType: source.mimeType
  });

  try {
    const resource = await db.$transaction(async (tx) => {
      const copy = await tx.driveFile.create({
        data: {
          ownerId: folder.ownerId,
          parentId: folder.id,
          name: source.name,
          kind: "file",
          mimeType: source.mimeType,
          size: bytes.length,
          path,
          contentHash: source.contentHash ?? createHash("sha256").update(bytes).digest("hex"),
          extractionStatus: source.extractionStatus,
          extractedText: source.extractedText,
          extractionError: source.extractionError,
          extractedAt: source.extractedAt
        }
      });
      await tx.courseDriveAccessRule.create({
        data: {
          courseId,
          driveFileId: copy.id,
          access: "ALLOW",
          updatedById: user.id
        }
      });
      return tx.resource.create({
        data: {
          courseId,
          title: source.name,
          type: "drive",
          driveFileId: copy.id,
          url: marker
        },
        include: { driveFile: true }
      });
    });
    return { resource, alreadyAttached: false };
  } catch (error) {
    await deleteDriveFileFromStorage({
      kind: "file",
      name: source.name,
      mimeType: source.mimeType,
      path
    }).catch(() => undefined);
    throw error;
  }
}
