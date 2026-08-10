import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isCourseManagerRecord,
  isTeacher,
  requireCourseAccess,
  requireCourseManager,
  requireCourseOwner
} from "@/lib/permissions";
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

function aiOutputFolderIds(
  courseId: string,
  rootId: string,
  nodes: DriveNode[],
  bindingFolderIds: string[]
) {
  const ids = new Set(bindingFolderIds);
  for (const node of nodes) {
    if (
      node.kind === "folder"
      && node.parentId === rootId
      && (node.name === "AI产物" || node.id === `course-drive-${courseId}-ai-output-root`)
    ) ids.add(node.id);
  }
  return ids;
}

function assertCourseDriveInstitution(
  user: SessionUser,
  course: { institutionId: string; ownerId: string }
) {
  if (
    isTeacher(user)
    && user.role !== "ADMIN"
    && user.id !== course.ownerId
    && user.institutionId !== course.institutionId
  ) {
    throw new CourseDriveError("不能管理其他机构的课程云盘", 403, "COURSE_DRIVE_INSTITUTION_MISMATCH");
  }
}

async function requireCourseDriveManagerAccess(user: SessionUser, courseId: string) {
  const course = await requireCourseManager(user, courseId);
  assertCourseDriveInstitution(user, course);
  return course;
}

async function requireCourseDriveManagerAccessInTransaction(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  courseId: string
) {
  if (!isTeacher(user)) {
    throw new CourseDriveError("需要教师权限", 403, "COURSE_DRIVE_MANAGER_REQUIRED");
  }
  const course = await tx.course.findFirst({
    where: {
      id: courseId,
      OR: [
        ...(user.role === "ADMIN" ? [{}] : []),
        { ownerId: user.id },
        { collaborators: { some: { userId: user.id } } }
      ]
    },
    select: { id: true, ownerId: true, institutionId: true, driveRootFolderId: true }
  });
  if (!course) {
    throw new CourseDriveError("无权管理课程", 403, "COURSE_DRIVE_MANAGER_REQUIRED");
  }
  assertCourseDriveInstitution(user, course);
  return course;
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

async function loadActiveOwnerNodes(
  ownerId: string,
  client: Pick<Prisma.TransactionClient, "driveFile"> = db
) {
  return client.driveFile.findMany({
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

async function loadTargetWithinRoot(
  course: { ownerId: string; driveRootFolderId: string | null },
  fileId: string,
  client: Pick<Prisma.TransactionClient, "driveFile"> = db
) {
  if (!course.driveRootFolderId) {
    throw new CourseDriveError("当前课程尚未设置云盘文件夹", 409, "COURSE_DRIVE_NOT_CONFIGURED");
  }
  const nodes = await loadActiveOwnerNodes(course.ownerId, client);
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
  assertCourseDriveInstitution(user, course);
  if (!course.driveRootFolderId) return null;
  return db.driveFile.findFirst({
    where: { id: course.driveRootFolderId, kind: "folder", deletedAt: null },
    select: { id: true, name: true }
  });
}

export async function listCourseDriveRootCandidates(user: SessionUser, courseId: string) {
  const course = await requireCourseOwner(user, courseId);
  assertCourseDriveInstitution(user, course);
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
  const course = await requireCourseDriveManagerAccess(user, courseId);
  if (course.driveRootFolderId) {
    const existing = await db.driveFile.findFirst({
      where: { id: course.driveRootFolderId, ownerId: course.ownerId, kind: "folder", deletedAt: null },
      select: { id: true, name: true }
    });
    if (existing) return existing;
  }
  await requireCourseOwner(user, courseId);
  return createCourseDriveRoot({ courseId: course.id, ownerId: course.ownerId, title: course.title });
}

async function loadOwnerNodes(
  ownerId: string,
  client: Pick<Prisma.TransactionClient, "driveFile"> = db
) {
  return client.driveFile.findMany({
    where: { ownerId },
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

const COURSE_DRIVE_REBIND_BLOCKED_MESSAGE =
  "当前课程云盘已产生课程资料、导入记录或 AI 产物，不能直接重新绑定。请先迁移或清理相关内容。";

async function bindCourseDriveRootInTransaction(
  tx: Prisma.TransactionClient,
  courseId: string,
  folderId: string,
  copilotName?: string
) {
  const course = await tx.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { id: true, ownerId: true, driveRootFolderId: true }
  });
  const nodes = await loadOwnerNodes(course.ownerId, tx);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const folder = byId.get(folderId);
  if (!folder || folder.kind !== "folder" || folder.deletedAt !== null) {
    throw new CourseDriveError("只能绑定课程教师拥有的有效文件夹", 400, "COURSE_DRIVE_ROOT_INVALID");
  }

  if (course.driveRootFolderId === folder.id) {
    if (copilotName !== undefined) {
      const write = await tx.course.updateMany({
        where: { id: courseId, driveRootFolderId: folder.id },
        data: { copilotName }
      });
      if (write.count !== 1) {
        throw new CourseDriveError("课程云盘根目录已被其他操作修改，请刷新后重试", 409, "COURSE_DRIVE_WRITE_CONFLICT");
      }
    }
    const current = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { driveRootFolderId: true, copilotName: true }
    });
    return { root: { id: folder.id, name: folder.name }, rebound: false, course: current };
  }

  const occupied = await tx.course.findMany({
    where: { driveRootFolderId: { not: null }, id: { not: courseId } },
    select: { id: true, driveRootFolderId: true }
  });
  if (occupied.length) {
    const overlaps = occupied.some((item) => {
      if (!item.driveRootFolderId) return false;
      const occupiedRoot = byId.get(item.driveRootFolderId);
      return Boolean(
        ancestryToRoot(folder, item.driveRootFolderId, byId)
        || (occupiedRoot?.deletedAt === null && ancestryToRoot(occupiedRoot, folder.id, byId))
      );
    });
    if (overlaps) {
      throw new CourseDriveError("该文件夹与其他课程云盘范围重叠", 409, "COURSE_DRIVE_ROOT_IN_USE");
    }
  }

  if (course.driveRootFolderId) {
    const oldRoot = byId.get(course.driveRootFolderId);
    if (!oldRoot) {
      throw new CourseDriveError(
        "当前课程云盘原根目录不存在，不能直接重新绑定。请先核对课程数据。",
        409,
        "COURSE_DRIVE_ROOT_MISSING"
      );
    }
    const oldRootIds = oldRoot
      ? nodes
        .filter((node) => node.deletedAt === null && ancestryToRoot(node, oldRoot.id, byId))
        .map((node) => node.id)
      : [];
    const hasActiveContent = oldRootIds.some((id) => id !== oldRoot.id);
    if (oldRootIds.length) {
      const referenceCounts = await Promise.all([
        tx.courseDriveBinding.count({ where: { folderId: { in: oldRootIds } } }),
        tx.courseDriveAccessRule.count({ where: { driveFileId: { in: oldRootIds } } }),
        tx.resource.count({ where: { driveFileId: { in: oldRootIds } } }),
        tx.documentImportJob.count({ where: { driveFileId: { in: oldRootIds }, deletedAt: null } }),
        tx.courseAiArtifactExport.count({
          where: { driveFileId: { in: oldRootIds }, artifact: { deletedAt: null } }
        }),
        tx.copilotConversationFile.count({ where: { driveFileId: { in: oldRootIds } } }),
        tx.topicResource.count({ where: { driveFileId: { in: oldRootIds }, topic: { deletedAt: null } } }),
        tx.groupFile.count({ where: { driveFileId: { in: oldRootIds } } })
      ]);
      if (hasActiveContent || referenceCounts.some((count) => count > 0)) {
        throw new CourseDriveError(
          COURSE_DRIVE_REBIND_BLOCKED_MESSAGE,
          409,
          "COURSE_DRIVE_REBIND_BLOCKED"
        );
      }
    }
  }

  const write = await tx.course.updateMany({
    where: { id: courseId, driveRootFolderId: course.driveRootFolderId },
    data: {
      driveRootFolderId: folder.id,
      ...(copilotName === undefined ? {} : { copilotName })
    }
  });
  if (write.count !== 1) {
    throw new CourseDriveError("课程云盘根目录已被其他操作修改，请刷新后重试", 409, "COURSE_DRIVE_WRITE_CONFLICT");
  }
  const updated = await tx.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { driveRootFolderId: true, copilotName: true }
  });
  return {
    root: { id: folder.id, name: folder.name },
    rebound: Boolean(course.driveRootFolderId),
    course: updated
  };
}

export async function bindCourseDriveRoot(user: SessionUser, courseId: string, folderId: string) {
  let course;
  try {
    course = await requireCourseOwner(user, courseId);
  } catch {
    throw new CourseDriveError("无权管理课程云盘根目录", 403, "COURSE_DRIVE_OWNER_REQUIRED");
  }
  assertCourseDriveInstitution(user, course);
  const result = await db.$transaction((tx) => bindCourseDriveRootInTransaction(tx, courseId, folderId));
  return { root: result.root, rebound: result.rebound };
}

export async function updateCourseDriveSettings(
  user: SessionUser,
  courseId: string,
  input: { folderId?: string; copilotName?: string }
) {
  const course = input.folderId === undefined
    ? await requireCourseDriveManagerAccess(user, courseId)
    : await requireCourseOwner(user, courseId);
  assertCourseDriveInstitution(user, course);

  if (input.folderId !== undefined) {
    const result = await db.$transaction((tx) => bindCourseDriveRootInTransaction(
      tx,
      courseId,
      input.folderId!,
      input.copilotName
    ));
    return result.course;
  }
  return db.course.update({
    where: { id: courseId },
    data: { copilotName: input.copilotName },
    select: { driveRootFolderId: true, copilotName: true }
  });
}

export async function requireCourseDriveTarget(user: SessionUser, courseId: string, fileId: string) {
  const course = await requireCourseAccess(user, courseId);
  assertCourseDriveInstitution(user, course);
  const context = await loadTargetWithinRoot(course, fileId);
  if (isCourseManagerRecord(user, course)) return context.target;
  const protectedAiOutput = await db.courseDriveBinding.findMany({
    where: { courseId, purpose: { startsWith: "AI_" }, folderId: { in: context.ancestry } },
    select: { folderId: true }
  });
  const protectedIds = aiOutputFolderIds(
    courseId,
    course.driveRootFolderId!,
    context.nodes,
    protectedAiOutput.map((binding) => binding.folderId)
  );
  if (context.ancestry.some((id) => protectedIds.has(id))) {
    throw new CourseDriveError("AI产物仅教师可见", 403, "COURSE_DRIVE_AI_OUTPUT_HIDDEN");
  }
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
  assertCourseDriveInstitution(user, course);
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
  const course = await requireCourseDriveManagerAccess(user, courseId);
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
  const course = await requireCourseDriveManagerAccess(user, courseId);
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
    await db.courseDriveBinding.upsert({
      where: { courseId_purpose: { courseId, purpose: "AI_OUTPUT_ROOT" } },
      create: { courseId, purpose: "AI_OUTPUT_ROOT", folderId: aiRoot.id },
      update: { folderId: aiRoot.id }
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
  assertCourseDriveInstitution(user, course);
  if (!course.driveRootFolderId) return [];
  const nodes = await loadActiveOwnerNodes(course.ownerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(course.driveRootFolderId);
  if (!root) return [];
  const descendantRows = nodes.filter((node) => ancestryToRoot(node, root.id, byId));
  const manager = isCourseManagerRecord(user, course);
  const [rules, aiBindings] = await Promise.all([
    db.courseDriveAccessRule.findMany({
      where: { courseId, driveFileId: { in: descendantRows.map((node) => node.id) } },
      select: { driveFileId: true, access: true }
    }),
    manager ? Promise.resolve([]) : db.courseDriveBinding.findMany({
      where: { courseId, purpose: { startsWith: "AI_" } },
      select: { folderId: true }
    })
  ]);
  const aiFolderIds = aiOutputFolderIds(courseId, root.id, nodes, aiBindings.map((binding) => binding.folderId));
  return descendantRows
    .filter((node) => node.id !== root.id)
    .filter((node) => {
      if (manager) return true;
      const ancestry = ancestryToRoot(node, root.id, byId);
      return Boolean(ancestry && !ancestry.some((id) => aiFolderIds.has(id)) && resolveNearestDriveRule(ancestry, rules) === "ALLOW");
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

export async function listStudentVisibleCourseFiles(user: SessionUser, courseId: string) {
  const course = await requireCourseDriveManagerAccess(user, courseId);
  if (!course.driveRootFolderId) return [];
  const nodes = await loadActiveOwnerNodes(course.ownerId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(course.driveRootFolderId);
  if (!root) return [];
  const descendants = nodes.filter((node) => node.kind !== "folder" && ancestryToRoot(node, root.id, byId));
  const [rules, aiBindings] = await Promise.all([
    db.courseDriveAccessRule.findMany({ where: { courseId }, select: { driveFileId: true, access: true } }),
    db.courseDriveBinding.findMany({ where: { courseId, purpose: { startsWith: "AI_" } }, select: { folderId: true } })
  ]);
  const aiFolderIds = aiOutputFolderIds(courseId, root.id, nodes, aiBindings.map((binding) => binding.folderId));
  return descendants.flatMap((node) => {
    const ancestry = ancestryToRoot(node, root.id, byId);
    if (!ancestry || ancestry.some((id) => aiFolderIds.has(id)) || resolveNearestDriveRule(ancestry, rules) !== "ALLOW") return [];
    return [{ id: node.id, name: node.name, path: nodePath(node, byId, root.id), mimeType: node.mimeType, size: node.size }];
  }).sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function assertAnnouncementAttachmentFiles(user: SessionUser, courseId: string, fileIds: string[]) {
  const uniqueIds = [...new Set(fileIds)];
  if (uniqueIds.length !== fileIds.length) throw new CourseDriveError("通知不能重复添加同一个文件", 400);
  const available = await listStudentVisibleCourseFiles(user, courseId);
  const byId = new Map(available.map((file) => [file.id, file]));
  const selected = uniqueIds.map((id) => byId.get(id));
  if (selected.some((file) => !file)) {
    throw new CourseDriveError("通知只能添加已向学生开放的课程文件，且不能引用 AI产物", 400, "NOTICE_ATTACHMENT_NOT_STUDENT_VISIBLE");
  }
  return selected.filter((file): file is NonNullable<typeof file> => Boolean(file));
}

export async function listCourseDriveChildren(user: SessionUser, courseId: string, parentId?: string | null) {
  const course = await requireCourseAccess(user, courseId);
  assertCourseDriveInstitution(user, course);
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
  const manager = isCourseManagerRecord(user, course);
  const [rules, aiBindings] = await Promise.all([
    db.courseDriveAccessRule.findMany({ where: { courseId }, select: { driveFileId: true, access: true } }),
    manager ? Promise.resolve([]) : db.courseDriveBinding.findMany({ where: { courseId, purpose: { startsWith: "AI_" } }, select: { folderId: true } })
  ]);
  const aiFolderIds = aiOutputFolderIds(courseId, root.id, nodes, aiBindings.map((binding) => binding.folderId));
  const visibleToStudent = (node: DriveNode) => {
    const ancestry = ancestryToRoot(node, root.id, byId);
    return Boolean(ancestry && !ancestry.some((id) => aiFolderIds.has(id)) && resolveNearestDriveRule(ancestry, rules) === "ALLOW");
  };
  const leadsToVisibleContent = (folder: DriveNode) => nodes.some((node) => {
    if (node.id === folder.id || !visibleToStudent(node)) return false;
    return ancestryToRoot(node, folder.id, byId) !== null;
  });
  const requestedParentAncestry = ancestryToRoot(requestedParent, root.id, byId) ?? [];
  if (!manager && requestedParentAncestry.some((id) => aiFolderIds.has(id))) {
    throw new CourseDriveError("AI产物仅教师可见", 403, "COURSE_DRIVE_AI_OUTPUT_HIDDEN");
  }
  if (!manager && requestedParent.id !== root.id && !visibleToStudent(requestedParent) && !leadsToVisibleContent(requestedParent)) {
    throw new CourseDriveError("教师尚未向学生开放此文件夹", 403, "COURSE_DRIVE_ACCESS_DENIED");
  }
  const children = nodes.filter((node) => node.parentId === requestedParent.id);
  const visible = manager
    ? children
    : children.filter((child) => visibleToStudent(child) || (child.kind === "folder" && leadsToVisibleContent(child)));
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

export async function requireCourseDriveMutationTarget(
  user: SessionUser,
  courseId: string,
  fileId: string
) {
  const course = await requireCourseDriveManagerAccess(user, courseId);
  const context = await loadTargetWithinRoot(course, fileId);
  return { course, ...context };
}

export async function requireCourseDriveMutationFolder(
  user: SessionUser,
  courseId: string,
  folderId: string
) {
  const context = await requireCourseDriveMutationTarget(user, courseId, folderId);
  if (context.target.kind !== "folder") {
    throw new CourseDriveError("目标位置不是文件夹", 400, "COURSE_DRIVE_TARGET_NOT_FOLDER");
  }
  return context;
}

export async function createCourseDriveFolder(
  user: SessionUser,
  courseId: string,
  parentId: string,
  name: string
) {
  const context = await requireCourseDriveMutationFolder(user, courseId, parentId);
  const normalizedName = name.trim();
  if (!normalizedName) throw new CourseDriveError("请输入文件夹名称", 400, "COURSE_DRIVE_NAME_REQUIRED");
  return db.driveFile.create({
    data: {
      ownerId: context.course.ownerId,
      parentId: context.target.id,
      name: normalizedName,
      kind: "folder"
    }
  });
}

export async function updateCourseDriveItem(
  user: SessionUser,
  courseId: string,
  fileId: string,
  input: { name?: string; parentId?: string | null }
) {
  return db.$transaction(async (tx) => {
    const course = await requireCourseDriveManagerAccessInTransaction(tx, user, courseId);
    const context = await loadTargetWithinRoot(course, fileId, tx);
    if (context.target.id === course.driveRootFolderId) {
      throw new CourseDriveError("课程云盘根目录不能重命名或移动", 409, "COURSE_DRIVE_ROOT_PROTECTED");
    }

    let nextParentId = context.target.parentId;
    if (Object.prototype.hasOwnProperty.call(input, "parentId")) {
      if (!input.parentId) {
        throw new CourseDriveError("课程云盘内容不能移出课程根目录", 403, "COURSE_DRIVE_OUTSIDE_ROOT");
      }
      const destination = await loadTargetWithinRoot(course, input.parentId, tx);
      if (destination.target.kind !== "folder") {
        throw new CourseDriveError("目标位置不是文件夹", 400, "COURSE_DRIVE_TARGET_NOT_FOLDER");
      }
      nextParentId = destination.target.id;
      if (context.target.kind === "folder") {
        const destinationAncestry = ancestryToRoot(destination.target, course.driveRootFolderId!, destination.byId) ?? [];
        if (destinationAncestry.includes(context.target.id)) {
          throw new CourseDriveError("不能把文件夹移动到自身或子文件夹中", 409, "COURSE_DRIVE_MOVE_CYCLE");
        }
      }
    }

    const normalizedName = input.name === undefined ? undefined : input.name.trim();
    if (input.name !== undefined && !normalizedName) {
      throw new CourseDriveError("文件名称不能为空", 400, "COURSE_DRIVE_NAME_REQUIRED");
    }
    const updated = await tx.driveFile.updateMany({
      where: {
        id: context.target.id,
        ownerId: course.ownerId,
        parentId: context.target.parentId,
        deletedAt: null
      },
      data: { name: normalizedName, parentId: nextParentId }
    });
    if (updated.count !== 1) {
      throw new CourseDriveError("文件已被其他操作修改，请刷新后重试", 409, "COURSE_DRIVE_WRITE_CONFLICT");
    }
    return tx.driveFile.findUniqueOrThrow({ where: { id: context.target.id } });
  });
}

export async function deleteCourseDriveItem(user: SessionUser, courseId: string, fileId: string) {
  return db.$transaction(async (tx) => {
    const course = await requireCourseDriveManagerAccessInTransaction(tx, user, courseId);
    const context = await loadTargetWithinRoot(course, fileId, tx);
    if (context.target.id === course.driveRootFolderId) {
      throw new CourseDriveError("课程云盘根目录不能删除", 409, "COURSE_DRIVE_ROOT_PROTECTED");
    }
    const ids = context.nodes
      .filter((node) => ancestryToRoot(node, context.target.id, context.byId))
      .map((node) => node.id);
    const [resources, importJobs, artifactExports, topicResources, groupFiles, copilotAttachments, announcementAttachments] = await Promise.all([
      tx.resource.count({ where: { driveFileId: { in: ids } } }),
      tx.documentImportJob.count({ where: { driveFileId: { in: ids } } }),
      tx.courseAiArtifactExport.count({ where: { driveFileId: { in: ids } } }),
      tx.topicResource.count({ where: { driveFileId: { in: ids } } }),
      tx.groupFile.count({ where: { driveFileId: { in: ids } } }),
      tx.copilotConversationFile.count({ where: { driveFileId: { in: ids } } }),
      tx.announcementAttachment.count({ where: { driveFileId: { in: ids } } })
    ]);
    const protectedReferenceCount = resources + importJobs + artifactExports + topicResources + groupFiles + copilotAttachments + announcementAttachments;
    if (protectedReferenceCount > 0) {
      throw new CourseDriveError(
        `文件已被课程内容、导入记录或 AI 产物引用（共 ${protectedReferenceCount} 处），不能删除`,
        409,
        "COURSE_DRIVE_FILE_IN_USE"
      );
    }

    const deletedFiles = context.nodes.filter((node) => ids.includes(node.id) && node.kind !== "folder");
    const deletedAt = new Date();
    await tx.driveShare.deleteMany({ where: { fileId: { in: ids } } });
    await tx.courseDriveBinding.deleteMany({ where: { courseId, folderId: { in: ids } } });
    await tx.courseDriveAccessRule.deleteMany({ where: { courseId, driveFileId: { in: ids } } });
    const deleted = await tx.driveFile.updateMany({
      where: { id: { in: ids }, ownerId: course.ownerId, deletedAt: null },
      data: { deletedAt }
    });
    if (deleted.count !== ids.length) {
      throw new CourseDriveError("文件已被其他操作修改，请刷新后重试", 409, "COURSE_DRIVE_WRITE_CONFLICT");
    }
    return { deletedCount: deleted.count, deletedFiles };
  });
}

export type CourseDriveTransaction = Prisma.TransactionClient;
