import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess, requireCourseManager } from "@/lib/permissions";
import {
  COURSE_DRIVE_PURPOSES,
  type CourseDriveAccess,
  type CourseDrivePurpose,
  isDocumentName
} from "./constants";

type DriveNode = {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  kind: string;
  mimeType: string | null;
  size: number;
  path: string | null;
  contentHash: string | null;
  deletedAt: Date | null;
};

export class CourseDriveError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "COURSE_DRIVE_ERROR"
  ) {
    super(message);
    this.name = "CourseDriveError";
  }
}

function nodePath(node: DriveNode, byId: Map<string, DriveNode>, stopId?: string) {
  const names = [node.name];
  const seen = new Set([node.id]);
  let current = node;
  while (current.parentId && current.id !== stopId) {
    const parent = byId.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    names.unshift(parent.name);
    current = parent;
    if (current.id === stopId) break;
  }
  return names.join(" / ");
}

function ancestryToRoot(
  target: Pick<DriveNode, "id" | "parentId">,
  rootId: string,
  byId: Map<string, Pick<DriveNode, "id" | "parentId">>
) {
  const ids: string[] = [];
  const seen = new Set<string>();
  let current: Pick<DriveNode, "id" | "parentId"> | undefined = target;
  while (current && !seen.has(current.id)) {
    ids.push(current.id);
    if (current.id === rootId) return ids;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

export function resolveNearestDriveRule(
  ancestry: string[],
  rules: Array<{ driveFileId: string; access: string }>
): CourseDriveAccess {
  const ruleByFile = new Map(rules.map((rule) => [rule.driveFileId, rule.access]));
  for (const id of ancestry) {
    const access = ruleByFile.get(id);
    if (access === "ALLOW" || access === "DENY") return access;
  }
  return "DENY";
}

async function loadActiveOwnerNodes(ownerId: string) {
  return db.driveFile.findMany({
    where: { ownerId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      parentId: true,
      name: true,
      kind: true,
      mimeType: true,
      size: true,
      path: true,
      contentHash: true,
      deletedAt: true
    }
  });
}

async function loadTargetWithinRoot(course: { ownerId: string; driveRootFolderId: string | null }, fileId: string) {
  if (!course.driveRootFolderId) {
    throw new CourseDriveError("当前课程尚未设置云盘文件夹", 409, "COURSE_DRIVE_NOT_CONFIGURED");
  }
  const nodes = await loadActiveOwnerNodes(course.ownerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const target = byId.get(fileId);
  if (!target) throw new CourseDriveError("文件不存在", 404, "COURSE_DRIVE_FILE_NOT_FOUND");
  const ancestry = ancestryToRoot(target, course.driveRootFolderId, byId);
  if (!ancestry) {
    throw new CourseDriveError("文件不在当前课程云盘中", 403, "COURSE_DRIVE_OUTSIDE_ROOT");
  }
  return { target, ancestry, nodes, byId };
}

export async function getCourseDriveRoot(user: SessionUser, courseId: string) {
  const course = await requireCourseAccess(user, courseId);
  if (!course.driveRootFolderId) return null;
  return db.driveFile.findFirst({
    where: { id: course.driveRootFolderId, kind: "folder", deletedAt: null },
    select: { id: true, name: true }
  });
}

export async function listCourseDriveRootCandidates(user: SessionUser, courseId: string) {
  const course = await requireCourseManager(user, courseId);
  const nodes = await loadActiveOwnerNodes(course.ownerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const occupiedRoots = new Set(
    (
      await db.course.findMany({
        where: { driveRootFolderId: { not: null }, id: { not: courseId } },
        select: { driveRootFolderId: true }
      })
    ).flatMap((item) => (item.driveRootFolderId ? [item.driveRootFolderId] : []))
  );
  return nodes
    .filter((node) => {
      if (node.kind !== "folder") return false;
      for (const occupiedRootId of occupiedRoots) {
        const occupiedRoot = byId.get(occupiedRootId);
        if (
          ancestryToRoot(node, occupiedRootId, byId)
          || (occupiedRoot && ancestryToRoot(occupiedRoot, node.id, byId))
        ) return false;
      }
      return true;
    })
    .map((node) => ({ id: node.id, name: node.name, path: nodePath(node, byId) }))
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function createCourseDriveRoot(input: { courseId: string; ownerId: string; title: string }) {
  return db.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: input.courseId, ownerId: input.ownerId },
      select: { id: true, driveRootFolderId: true }
    });
    if (!course) throw new CourseDriveError("课程不存在", 404, "COURSE_NOT_FOUND");
    if (course.driveRootFolderId) {
      const existing = await tx.driveFile.findFirst({
        where: { id: course.driveRootFolderId, kind: "folder", deletedAt: null },
        select: { id: true, name: true }
      });
      if (existing) return existing;
    }
    const rootId = `course-drive-root-${input.courseId}`;
    const root = await tx.driveFile.upsert({
      where: { id: rootId },
      create: {
        id: rootId,
        ownerId: input.ownerId,
        parentId: null,
        name: input.title.trim(),
        kind: "folder"
      },
      update: {
        ownerId: input.ownerId,
        parentId: null,
        name: input.title.trim(),
        kind: "folder",
        deletedAt: null
      },
      select: { id: true, name: true }
    });
    await tx.course.update({
      where: { id: input.courseId },
      data: { driveRootFolderId: root.id }
    });
    return root;
  });
}

export async function ensureCourseDriveRoot(user: SessionUser, courseId: string) {
  const course = await requireCourseManager(user, courseId);
  return createCourseDriveRoot({ courseId: course.id, ownerId: course.ownerId, title: course.title });
}

export async function bindCourseDriveRoot(user: SessionUser, courseId: string, folderId: string) {
  const course = await requireCourseManager(user, courseId);
  const folder = await db.driveFile.findFirst({
    where: { id: folderId, ownerId: course.ownerId, kind: "folder", deletedAt: null },
    select: { id: true, name: true, parentId: true }
  });
  if (!folder) {
    throw new CourseDriveError("只能绑定课程教师拥有的有效文件夹", 400, "COURSE_DRIVE_ROOT_INVALID");
  }
  const occupied = await db.course.findMany({
    where: { driveRootFolderId: { not: null }, id: { not: courseId } },
    select: { id: true, driveRootFolderId: true }
  });
  if (occupied.length) {
    const nodes = await loadActiveOwnerNodes(course.ownerId);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const overlaps = occupied.some((item) => {
      if (!item.driveRootFolderId) return false;
      const occupiedRoot = byId.get(item.driveRootFolderId);
      return Boolean(
        ancestryToRoot(folder, item.driveRootFolderId, byId)
        || (occupiedRoot && ancestryToRoot(occupiedRoot, folder.id, byId))
      );
    });
    if (overlaps) {
      throw new CourseDriveError("该文件夹与其他课程云盘范围重叠", 409, "COURSE_DRIVE_ROOT_IN_USE");
    }
  }
  const rebound = Boolean(course.driveRootFolderId && course.driveRootFolderId !== folder.id);
  await db.course.update({ where: { id: courseId }, data: { driveRootFolderId: folder.id } });
  return { root: { id: folder.id, name: folder.name }, rebound };
}

export async function requireCourseDriveTarget(user: SessionUser, courseId: string, fileId: string) {
  const course = await requireCourseAccess(user, courseId);
  const context = await loadTargetWithinRoot(course, fileId);
  if (isCourseManagerRecord(user, course)) return context.target;
  const rules = await db.courseDriveAccessRule.findMany({
    where: { courseId, driveFileId: { in: context.ancestry } },
    select: { driveFileId: true, access: true }
  });
  if (resolveNearestDriveRule(context.ancestry, rules) !== "ALLOW") {
    throw new CourseDriveError("教师尚未向学生开放此文件", 403, "COURSE_DRIVE_ACCESS_DENIED");
  }
  return context.target;
}

export async function resolveCourseDriveAccess(user: SessionUser, courseId: string, fileId: string) {
  const course = await requireCourseAccess(user, courseId);
  const context = await loadTargetWithinRoot(course, fileId);
  if (isCourseManagerRecord(user, course)) {
    return { access: "ALLOW" as const, inherited: false, manager: true };
  }
  const rules = await db.courseDriveAccessRule.findMany({
    where: { courseId, driveFileId: { in: context.ancestry } },
    select: { driveFileId: true, access: true }
  });
  const nearest = context.ancestry.find((id) => rules.some((rule) => rule.driveFileId === id));
  return {
    access: resolveNearestDriveRule(context.ancestry, rules),
    inherited: Boolean(nearest && nearest !== fileId),
    manager: false
  };
}

export async function setCourseDriveAccess(
  user: SessionUser,
  courseId: string,
  fileId: string,
  access: CourseDriveAccess | "INHERIT"
) {
  const course = await requireCourseManager(user, courseId);
  await loadTargetWithinRoot(course, fileId);
  if (access === "INHERIT") {
    await db.courseDriveAccessRule.deleteMany({ where: { courseId, driveFileId: fileId } });
  } else {
    await db.courseDriveAccessRule.upsert({
      where: { courseId_driveFileId: { courseId, driveFileId: fileId } },
      create: { courseId, driveFileId: fileId, access, updatedById: user.id },
      update: { access, updatedById: user.id }
    });
  }
  return db.courseDriveAccessRule.findUnique({
    where: { courseId_driveFileId: { courseId, driveFileId: fileId } }
  });
}

export async function ensureCoursePurposeFolder(
  user: SessionUser,
  courseId: string,
  purpose: CourseDrivePurpose
) {
  const course = await requireCourseManager(user, courseId);
  const root = await ensureCourseDriveRoot(user, courseId);
  const existingBinding = await db.courseDriveBinding.findUnique({
    where: { courseId_purpose: { courseId, purpose } },
    include: { folder: true }
  });
  if (
    existingBinding?.folder.deletedAt === null
    && existingBinding.folder.kind === "folder"
    && existingBinding.folder.ownerId === course.ownerId
  ) {
    const existingContext = await loadTargetWithinRoot(
      { ...course, driveRootFolderId: root.id },
      existingBinding.folderId
    ).catch(() => null);
    if (existingContext) return existingBinding.folder;
  }

  const name = COURSE_DRIVE_PURPOSES[purpose];
  let parentId = root.id;
  if (purpose.startsWith("AI_")) {
    const aiRootMatches = await db.driveFile.findMany({
      where: {
        ownerId: course.ownerId,
        parentId: root.id,
        name: "AI产物",
        kind: "folder",
        deletedAt: null
      },
      orderBy: { createdAt: "asc" }
    });
    if (aiRootMatches.length > 1) {
      throw new CourseDriveError(
        "课程根目录中有多个“AI产物”文件夹，请先在云盘中整理后重试",
        409,
        "COURSE_DRIVE_DUPLICATE_PURPOSE_FOLDER"
      );
    }
    const aiRoot = aiRootMatches[0] ?? await db.driveFile.upsert({
      where: { id: `course-drive-${courseId}-ai-output-root` },
      create: {
        id: `course-drive-${courseId}-ai-output-root`,
        ownerId: course.ownerId,
        parentId: root.id,
        name: "AI产物",
        kind: "folder"
      },
      update: {
        ownerId: course.ownerId,
        parentId: root.id,
        name: "AI产物",
        kind: "folder",
        deletedAt: null
      }
    });
    parentId = aiRoot.id;
  }
  const matches = await db.driveFile.findMany({
    where: {
      ownerId: course.ownerId,
      parentId,
      name,
      kind: "folder",
      deletedAt: null
    },
    orderBy: { createdAt: "asc" }
  });
  if (matches.length > 1) {
    throw new CourseDriveError(
      `课程根目录中有多个“${name}”文件夹，请先在云盘中整理后重试`,
      409,
      "COURSE_DRIVE_DUPLICATE_PURPOSE_FOLDER"
    );
  }
  const folder = matches[0] ?? await db.driveFile.upsert({
    where: { id: `course-drive-${courseId}-${purpose.toLowerCase()}` },
    create: {
      id: `course-drive-${courseId}-${purpose.toLowerCase()}`,
      ownerId: course.ownerId,
      parentId,
      name,
      kind: "folder"
    },
    update: {
      ownerId: course.ownerId,
      parentId,
      name,
      kind: "folder",
      deletedAt: null
    }
  });
  await db.courseDriveBinding.upsert({
    where: { courseId_purpose: { courseId, purpose } },
    create: { courseId, purpose, folderId: folder.id },
    update: { folderId: folder.id }
  });
  return folder;
}

export async function listCourseDrivePicker(
  user: SessionUser,
  courseId: string,
  options: { documentsOnly?: boolean } = {}
) {
  const course = await requireCourseAccess(user, courseId);
  if (!course.driveRootFolderId) return [];
  const nodes = await loadActiveOwnerNodes(course.ownerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(course.driveRootFolderId);
  if (!root) return [];
  const descendantRows = nodes.filter((node) => ancestryToRoot(node, root.id, byId));
  const rules = await db.courseDriveAccessRule.findMany({
    where: { courseId, driveFileId: { in: descendantRows.map((node) => node.id) } },
    select: { driveFileId: true, access: true }
  });
  const manager = isCourseManagerRecord(user, course);
  return descendantRows
    .filter((node) => node.id !== root.id)
    .filter((node) => {
      if (manager) return true;
      const ancestry = ancestryToRoot(node, root.id, byId);
      return Boolean(ancestry && resolveNearestDriveRule(ancestry, rules) === "ALLOW");
    })
    .filter((node) => !options.documentsOnly || (node.kind !== "folder" && isDocumentName(node.name)))
    .map((node) => ({
      id: node.id,
      name: node.name,
      path: nodePath(node, byId, root.id),
      kind: node.kind,
      mimeType: node.mimeType,
      parentId: node.parentId
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function listCourseDriveChildren(user: SessionUser, courseId: string, parentId?: string | null) {
  const course = await requireCourseAccess(user, courseId);
  if (!course.driveRootFolderId) {
    throw new CourseDriveError("当前课程尚未设置云盘文件夹", 409, "COURSE_DRIVE_NOT_CONFIGURED");
  }
  const nodes = await loadActiveOwnerNodes(course.ownerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(course.driveRootFolderId);
  if (!root) throw new CourseDriveError("课程云盘文件夹不存在", 409, "COURSE_DRIVE_ROOT_MISSING");
  const requestedParent = parentId ? byId.get(parentId) : root;
  if (!requestedParent || !ancestryToRoot(requestedParent, root.id, byId)) {
    throw new CourseDriveError("目标文件夹不在当前课程云盘中", 403, "COURSE_DRIVE_OUTSIDE_ROOT");
  }
  const rules = await db.courseDriveAccessRule.findMany({
    where: { courseId },
    select: { driveFileId: true, access: true }
  });
  const manager = isCourseManagerRecord(user, course);
  const requestedParentAncestry = ancestryToRoot(requestedParent, root.id, byId) ?? [];
  if (!manager && requestedParent.id !== root.id && resolveNearestDriveRule(requestedParentAncestry, rules) !== "ALLOW") {
    throw new CourseDriveError("教师尚未向学生开放此文件夹", 403, "COURSE_DRIVE_ACCESS_DENIED");
  }
  const children = nodes.filter((node) => node.parentId === requestedParent.id);
  const visible = manager
    ? children
    : children.filter((child) => {
        const childAncestry = ancestryToRoot(child, root.id, byId);
        return Boolean(childAncestry && resolveNearestDriveRule(childAncestry, rules) === "ALLOW");
      });
  const breadcrumbs = [...requestedParentAncestry]
    .reverse()
    .map((id) => byId.get(id))
    .filter((node): node is DriveNode => Boolean(node))
    .map((node) => ({ id: node.id, name: node.name }));
  return {
    root: { id: root.id, name: root.name },
    parent: { id: requestedParent.id, name: requestedParent.name },
    breadcrumbs,
    items: visible.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      name: node.name,
      kind: node.kind,
      mimeType: node.mimeType,
      size: node.size,
      studentAccess: resolveNearestDriveRule(ancestryToRoot(node, root.id, byId) ?? [], rules)
    }))
  };
}

export async function countFilesBelowFolder(courseOwnerId: string, folderId: string) {
  const nodes = await loadActiveOwnerNodes(courseOwnerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.filter((node) => node.kind !== "folder" && ancestryToRoot(node, folderId, byId)).length;
}

export type CourseDriveTransaction = Prisma.TransactionClient;
