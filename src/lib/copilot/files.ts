import { createHash } from "crypto";
import { extname } from "path";
import sharp from "sharp";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractText } from "@/lib/document/extractText";
import { hasKnowledgeDocument, indexKnowledgeDocument, removeKnowledgeDocument } from "@/lib/document/knowledgeDb";
import { requireCourseAccess } from "@/lib/permissions";
import {
  createDriveFolderWithUniqueName,
  readDriveFileBytes,
  storeDriveFile,
  withDriveFilePath,
  type DriveFileStorageRecord
} from "@/lib/modules/driveFiles";
import {
  ensureCoursePurposeFolder,
  listCourseDrivePicker
} from "@/lib/courseDrive/service";

export const COPILOT_MAX_UPLOAD_BYTES = 255 * 1024 * 1024;
export const COPILOT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const COPILOT_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_DRIVE_BATCH_FILES = 200;

const documentExtensions = new Set([".pdf", ".docx", ".pptx", ".txt", ".md"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".heif"]);

export type CopilotFileKind = "document" | "image" | "unsupported";
export type ConversationDriveReference = {
  driveFileId: string;
  referenceType: "FILE" | "FOLDER";
};

export function copilotFileKind(name: string, mimeType?: string | null): CopilotFileKind {
  const extension = extname(name).toLowerCase();
  if (documentExtensions.has(extension)) return "document";
  if (imageExtensions.has(extension)) return "image";
  if (mimeType?.startsWith("image/") && !/gif|apng/i.test(mimeType)) return "image";
  return "unsupported";
}

export function driveContentHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function copilotExtractionCanBeSelected(status: string) {
  return status === "READY" || status === "PENDING" || status === "FAILED" || status === "TOO_LARGE";
}

export function copilotExtractionNeedsIndexing(status: string) {
  return status === "PENDING" || status === "FAILED" || status === "TOO_LARGE";
}

export function copilotExtractionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "文档解析失败";
  if (message.includes("SignatureDoesNotMatch")) {
    return "OSS 文件读取验证失败，请重新选择文件重试；若仍失败，请检查 OSS 配置";
  }
  return message.slice(0, 500);
}

export async function storeDriveUpload(input: {
  ownerId: string;
  parentId: string | null;
  file: File;
}) {
  return storeDriveUploadRecord({ ...input, indexImmediately: true });
}

async function storeDriveUploadRecord(input: {
  ownerId: string;
  parentId: string | null;
  file: File;
  indexImmediately: boolean;
}) {
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const path = await storeDriveFile({
    ownerId: input.ownerId,
    fileName: input.file.name,
    bytes,
    mimeType: input.file.type || null
  });
  const record = await db.driveFile.create({
    data: {
      ownerId: input.ownerId,
      parentId: input.parentId,
      name: input.file.name,
      kind: "file",
      mimeType: input.file.type || null,
      size: input.file.size,
      path,
      contentHash: driveContentHash(bytes),
      extractionStatus: "PENDING"
    }
  });
  if (input.indexImmediately) await indexDriveFile(record.id);
  return db.driveFile.findUniqueOrThrow({ where: { id: record.id } });
}

export type DriveBatchUploadItem = { file: File; path?: string };

function relativePathSegments(path: string) {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
}

/**
 * Batch-uploads files in one request. When `folderName` is given the files are
 * placed inside a newly created folder (auto-renamed when the name is taken)
 * and `item.path` preserves the sub-folder hierarchy relative to that folder.
 * Extraction is deferred (records stay PENDING and are indexed lazily when a
 * conversation first references them) so a large batch does not block the
 * upload request on document parsing.
 */
export async function storeDriveBatchUpload(input: {
  ownerId: string;
  parentId: string | null;
  folderName?: string;
  items: DriveBatchUploadItem[];
}) {
  if (!input.items.length) throw new Error("请选择要上传的文件");
  if (input.items.length > MAX_DRIVE_BATCH_FILES) {
    throw new Error(`一次最多上传 ${MAX_DRIVE_BATCH_FILES} 个文件`);
  }

  const folderName = input.folderName?.trim();
  const rootFolder = folderName
    ? await createDriveFolderWithUniqueName(input.ownerId, input.parentId, folderName)
    : null;

  const folderIdByDirectory = new Map<string, string | null>();
  folderIdByDirectory.set("", rootFolder ? rootFolder.id : input.parentId);

  async function parentFor(item: DriveBatchUploadItem) {
    // The relative path ends with the file name; only the leading segments are
    // directories. A file directly inside the uploaded folder has no directory
    // segments and lands in the folder itself.
    const segments = relativePathSegments(item.path ?? "").slice(0, -1);
    if (!segments.length) return folderIdByDirectory.get("")!;
    let parentId = folderIdByDirectory.get("")!;
    let directory = "";
    for (const segment of segments) {
      directory = directory ? `${directory}/${segment}` : segment;
      let folderId = folderIdByDirectory.get(directory);
      if (!folderId) {
        const created = await createDriveFolderWithUniqueName(input.ownerId, parentId, segment);
        folderId = created.id;
        folderIdByDirectory.set(directory, folderId);
      }
      parentId = folderId;
    }
    return parentId;
  }

  const files: Array<Awaited<ReturnType<typeof storeDriveUpload>>> = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const item of input.items) {
    try {
      const record = await storeDriveUploadRecord({
        ownerId: input.ownerId,
        parentId: await parentFor(item),
        file: item.file,
        indexImmediately: false
      });
      files.push(record);
    } catch (error) {
      failed.push({ name: item.file.name, error: error instanceof Error ? error.message : "上传失败" });
    }
  }
  return { folder: rootFolder, files, failed };
}

export async function storeCourseConversationUpload(user: SessionUser, courseId: string, file: File) {
  const folder = await ensureCoursePurposeFolder(user, courseId, "CONVERSATION_UPLOADS");
  return storeDriveUpload({ ownerId: folder.ownerId, parentId: folder.id, file });
}

/**
 * Import upload with content-hash de-duplication. If an identical file (same
 * SHA-256) already lives, undeleted, in the same folder we reuse that drive
 * file instead of uploading the bytes again — saving storage and bandwidth when
 * a teacher re-imports the same document. Returns `reused` so callers can tell.
 */
export async function findOrCreateDriveImportUpload(input: {
  ownerId: string;
  parentId: string | null;
  file: File;
}) {
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const contentHash = driveContentHash(bytes);
  const existing = await db.driveFile.findFirst({
    where: {
      ownerId: input.ownerId,
      parentId: input.parentId,
      contentHash,
      kind: "file",
      deletedAt: null
    },
    orderBy: { createdAt: "desc" }
  });
  if (existing) return { file: existing, reused: true as const };

  const path = await storeDriveFile({
    ownerId: input.ownerId,
    fileName: input.file.name,
    bytes,
    mimeType: input.file.type || null
  });
  const record = await db.driveFile.create({
    data: {
      ownerId: input.ownerId,
      parentId: input.parentId,
      name: input.file.name,
      kind: "file",
      mimeType: input.file.type || null,
      size: input.file.size,
      path,
      contentHash,
      extractionStatus: "PENDING"
    }
  });
  await indexDriveFile(record.id);
  const file = await db.driveFile.findUniqueOrThrow({ where: { id: record.id } });
  return { file, reused: false as const };
}

export async function assertDriveMoveAllowed(ownerId: string, fileId: string, parentId: string | null) {
  const [nodes, courses] = await Promise.all([
    db.driveFile.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, parentId: true, kind: true }
    }),
    db.course.findMany({
      where: { ownerId, driveRootFolderId: { not: null } },
      select: { driveRootFolderId: true }
    })
  ]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const source = byId.get(fileId);
  if (!source) throw new Error("文件不存在");
  const target = parentId ? byId.get(parentId) : null;
  if (parentId && (!target || target.kind !== "folder")) throw new Error("目标文件夹不存在");

  const seen = new Set<string>();
  let current = target;
  while (current) {
    if (current.id === fileId) throw new Error("不能把文件夹移动到自身或子文件夹中");
    if (!current.parentId || seen.has(current.id)) break;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  if (source.parentId === parentId) return;

  const boundRoots = new Set(
    courses.map((course) => course.driveRootFolderId).filter((id): id is string => Boolean(id))
  );
  const containingRoot = (startId: string | null) => {
    let id = startId;
    const visited = new Set<string>();
    while (id && !visited.has(id)) {
      if (boundRoots.has(id)) return id;
      visited.add(id);
      id = byId.get(id)?.parentId ?? null;
    }
    return null;
  };
  const containsBoundRoot = [...boundRoots].some((rootId) => {
    let id: string | null = rootId;
    const visited = new Set<string>();
    while (id && !visited.has(id)) {
      if (id === fileId) return true;
      visited.add(id);
      id = byId.get(id)?.parentId ?? null;
    }
    return false;
  });
  if (containsBoundRoot) {
    throw new Error("课程云盘根目录不能通过普通移动操作变更，请在课程云盘中重新绑定");
  }
  const sourceRoot = containingRoot(fileId);
  const targetRoot = containingRoot(parentId);
  if (sourceRoot && sourceRoot !== targetRoot) {
    throw new Error("课程云盘中的内容不能移出或移动到其他课程云盘");
  }
}

export async function indexDriveFile(fileId: string) {
  const file = await db.driveFile.findUnique({ where: { id: fileId } });
  if (!file || file.kind !== "file" || !file.path) throw new Error("文件不存在");
  const kind = copilotFileKind(file.name, file.mimeType);

  if (kind === "image") {
    removeKnowledgeDocument(file.id);
    await db.driveFile.update({
      where: { id: file.id },
      data: { extractionStatus: "READY", extractedText: null, extractionError: null, extractedAt: new Date() }
    });
    return;
  }
  if (kind === "unsupported") {
    removeKnowledgeDocument(file.id);
    await db.driveFile.update({
      where: { id: file.id },
      data: { extractionStatus: "UNSUPPORTED", extractedText: null, extractionError: "当前格式暂不支持 AI 读取", extractedAt: new Date() }
    });
    return;
  }

  await db.driveFile.update({
    where: { id: file.id },
    data: { extractionStatus: "PROCESSING", extractionError: null }
  });
  try {
    const extracted = await withDriveFilePath(file, (localPath) => extractText(localPath, file.mimeType));
    try {
      // Keep the local FTS5 knowledge index in sync with every successful
      // extraction so AI tutor retrieval can find full-file chunks (with page
      // numbers for PDFs). A search-index failure must not fail extraction.
      indexKnowledgeDocument(file.id, extracted);
    } catch (indexError) {
      console.error(`知识库索引失败（${file.id}）`, indexError);
    }
    await db.driveFile.update({
      where: { id: file.id },
      data: {
        extractionStatus: "READY",
        extractedText: extracted.text,
        extractionError: null,
        extractedAt: new Date()
      }
    });
  } catch (error) {
    await db.driveFile.update({
      where: { id: file.id },
      data: {
        extractionStatus: "FAILED",
        extractedText: null,
        extractionError: copilotExtractionErrorMessage(error),
        extractedAt: new Date()
      }
    });
  }
}

export async function listCourseCopilotFiles(user: SessionUser, courseId: string) {
  await requireCourseAccess(user, courseId);
  const pickerItems = await listCourseDrivePicker(user, courseId);
  const rows = await db.driveFile.findMany({
    where: { id: { in: pickerItems.map((item) => item.id) }, deletedAt: null },
    select: {
      id: true,
      name: true,
      kind: true,
      mimeType: true,
      size: true,
      extractionStatus: true,
      extractionError: true
    }
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return pickerItems
    .map((item) => {
      const row = rowsById.get(item.id);
      if (!row) return null;
      if (row.kind === "folder") {
        return {
          ...row,
          parentId: item.parentId,
          path: item.path,
          contextKind: "folder" as const,
          contextReady: true,
          contextSelectable: true,
          extractionError: null,
          referenceType: "FOLDER" as const
        };
      }
      const contextKind = copilotFileKind(row.name, row.mimeType);
      const imageTooLarge = contextKind === "image" && row.size > COPILOT_MAX_IMAGE_BYTES;
      const supported = contextKind !== "unsupported" && !imageTooLarge;
      const legacyTooLarge = row.extractionStatus === "TOO_LARGE";
      return {
        ...row,
        parentId: item.parentId,
        path: item.path,
        contextKind,
        contextReady: row.extractionStatus === "READY" && supported,
        contextSelectable: supported && copilotExtractionCanBeSelected(row.extractionStatus),
        extractionError: imageTooLarge
          ? "图片超过单张 10MB 限制"
          : legacyTooLarge
            ? "文档较大，首次加入对话时会自动重新解析"
            : row.extractionError,
        referenceType: "FILE" as const
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function assertCourseCopilotReferences(
  user: SessionUser,
  courseId: string,
  references: ConversationDriveReference[]
) {
  const uniqueIds = new Set(references.map((reference) => reference.driveFileId));
  if (uniqueIds.size !== references.length) throw new Error("不能重复引用同一个文件或文件夹");
  const available = await listCourseCopilotFiles(user, courseId);
  const byId = new Map(available.map((item) => [item.id, item]));
  return references.map((reference) => {
    const target = byId.get(reference.driveFileId);
    if (!target) throw new Error("文件或文件夹不存在、未开放或不属于当前课程云盘");
    const expectedType = target.kind === "folder" ? "FOLDER" : "FILE";
    if (reference.referenceType !== expectedType) throw new Error("引用类型与云盘内容不匹配");
    if (!target.contextSelectable) throw new Error(target.extractionError || "文件当前不可供 AI 使用");
    return target;
  });
}

function includesDescendant(
  item: { id: string; parentId: string | null },
  folderId: string,
  byId: Map<string, { id: string; parentId: string | null }>
) {
  const seen = new Set<string>();
  let current: { id: string; parentId: string | null } | undefined = item;
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === folderId) return true;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return false;
}

export function expandConversationReferenceIds(
  targets: Array<{ id: string; parentId: string | null; kind: string }>,
  references: ConversationDriveReference[]
) {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const allowedReferences = references.filter((reference) => targetById.has(reference.driveFileId));
  const folderIds = new Set(
    allowedReferences.filter((reference) => reference.referenceType === "FOLDER").map((reference) => reference.driveFileId)
  );
  const directFileIds = new Set(
    allowedReferences.filter((reference) => reference.referenceType === "FILE").map((reference) => reference.driveFileId)
  );
  const ancestryById = new Map(targets.map((target) => [target.id, { id: target.id, parentId: target.parentId }]));
  return targets
    .filter((target) => target.kind !== "folder")
    .filter((target) => directFileIds.has(target.id) || [...folderIds].some((folderId) => includesDescendant(target, folderId, ancestryById)))
    .map((target) => target.id);
}

function queryScore(query: string, name: string, text: string | null) {
  const terms = query.toLocaleLowerCase().match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g) ?? [];
  if (!terms.length) return 0;
  const normalizedName = name.toLocaleLowerCase();
  const normalizedText = (text ?? "").slice(0, 20_000).toLocaleLowerCase();
  return terms.reduce((score, term) => score + (normalizedName.includes(term) ? 8 : 0) + (normalizedText.includes(term) ? 1 : 0), 0);
}

export async function resolveCourseConversationFiles(input: {
  user: SessionUser;
  courseId: string;
  references: ConversationDriveReference[];
  query: string;
}) {
  if (!input.references.length) return [];
  const targets = await listCourseCopilotFiles(input.user, input.courseId);
  const directFileIds = new Set(
    input.references.filter((reference) => reference.referenceType === "FILE").map((reference) => reference.driveFileId)
  );
  const candidateIds = expandConversationReferenceIds(targets, input.references);

  const indexingIds = targets
    .filter((target) => candidateIds.includes(target.id) && copilotExtractionNeedsIndexing(target.extractionStatus))
    .map((target) => target.id);
  for (let offset = 0; offset < indexingIds.length; offset += 3) {
    await Promise.allSettled(indexingIds.slice(offset, offset + 3).map(indexDriveFile));
  }

  const records = await db.driveFile.findMany({
    where: { id: { in: candidateIds }, kind: "file", deletedAt: null },
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      path: true,
      extractionStatus: true,
      extractionError: true,
      extractedText: true
    }
  });
  // Backfill the FTS index for files extracted before the knowledge database
  // existed: re-extract once so PDFs regain page numbers, then the ranked
  // selection below can use full-file chunks instead of head truncation.
  const missingKnowledgeIndexIds = records
    .filter((record) =>
      copilotFileKind(record.name, record.mimeType) === "document"
      && record.extractionStatus === "READY"
      && !hasKnowledgeDocument(record.id)
    )
    .map((record) => record.id);
  for (let offset = 0; offset < missingKnowledgeIndexIds.length; offset += 3) {
    await Promise.allSettled(missingKnowledgeIndexIds.slice(offset, offset + 3).map(indexDriveFile));
  }
  const ranked = records
    .filter((record) => copilotFileKind(record.name, record.mimeType) !== "unsupported")
    .map((record) => ({
      record,
      direct: directFileIds.has(record.id),
      score: queryScore(input.query, record.name, record.extractedText)
    }))
    .sort((left, right) => Number(right.direct) - Number(left.direct) || right.score - left.score || left.record.name.localeCompare(right.record.name, "zh-CN"));

  let imageBytes = 0;
  const selected = [];
  for (const { record } of ranked) {
    const kind = copilotFileKind(record.name, record.mimeType);
    if (kind === "document") {
      if (record.extractionStatus !== "READY" || !record.extractedText) continue;
    } else {
      if (record.extractionStatus !== "READY" || record.size > COPILOT_MAX_IMAGE_BYTES) continue;
      if (imageBytes + record.size > COPILOT_MAX_TOTAL_IMAGE_BYTES) continue;
      imageBytes += record.size;
    }
    selected.push(record);
  }
  return selected;
}

export async function buildCopilotFileContext(fileIds: string[]) {
  const files = await db.driveFile.findMany({ where: { id: { in: fileIds }, deletedAt: null } });
  const ordered = fileIds.map((id) => files.find((file) => file.id === id)).filter(Boolean) as typeof files;
  let imageBytes = 0;
  const documents: Array<{ name: string; text: string }> = [];
  const images: Array<{ name: string; mimeType: string; data: string }> = [];

  for (const file of ordered) {
    const kind = copilotFileKind(file.name, file.mimeType);
    if (kind === "document") {
      if (file.extractionStatus !== "READY" || !file.extractedText) throw new Error(`${file.name} 尚未完成解析`);
      documents.push({ name: file.name, text: file.extractedText });
      continue;
    }
    if (kind === "image") {
      if (file.size > COPILOT_MAX_IMAGE_BYTES) throw new Error(`${file.name} 超过单张图片 10MB 限制`);
      imageBytes += file.size;
      if (imageBytes > COPILOT_MAX_TOTAL_IMAGE_BYTES) throw new Error("图片合计不能超过 20MB");
      const prepared = await prepareImageForModel(file);
      images.push({ name: file.name, ...prepared });
      continue;
    }
    throw new Error(`${file.name} 当前格式暂不支持 AI 读取`);
  }
  return { documents, images, imageBytes };
}

async function prepareImageForModel(file: DriveFileStorageRecord) {
  const bytes = await readDriveFileBytes(file);
  const extension = extname(file.name).toLowerCase();
  const metadata = await sharp(bytes, { animated: true }).metadata();
  if ((metadata.pages ?? 1) > 1) throw new Error(`${file.name} 是动图，暂不支持`);
  if (extension === ".jpg" || extension === ".jpeg" || extension === ".png" || extension === ".webp") {
    const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
    return { mimeType, data: bytes.toString("base64") };
  }
  const normalized = await sharp(bytes, { animated: false }).rotate().png().toBuffer();
  return { mimeType: "image/png", data: normalized.toString("base64") };
}

export async function listOwnerDriveFolders(user: SessionUser) {
  const rows = await db.driveFile.findMany({
    where: { ownerId: user.id, kind: "folder", deletedAt: null },
    select: {
      id: true,
      parentId: true,
      name: true,
      rootCourse: { select: { id: true, title: true } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    const parts = [row.name];
    let current = row;
    const seen = new Set([row.id]);
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      parts.unshift(parent.name);
      current = parent;
    }
    return { id: row.id, name: row.name, path: parts.join(" / "), boundCourses: row.rootCourse ? [row.rootCourse] : [] };
  }).sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function assertOwnerFolder(user: SessionUser, folderId: string) {
  const folder = await db.driveFile.findFirst({
    where: { id: folderId, ownerId: user.id, kind: "folder", deletedAt: null }
  });
  if (!folder) throw new Error("云盘文件夹不存在或无权访问");
  return folder;
}
