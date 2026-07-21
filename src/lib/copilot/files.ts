import { createHash } from "crypto";
import { extname } from "path";
import sharp from "sharp";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractText } from "@/lib/document/extractText";
import { requireCourseAccess } from "@/lib/permissions";
import { readDriveFileBytes, storeDriveFile, withDriveFilePath, type DriveFileStorageRecord } from "@/lib/modules/driveFiles";

export const COPILOT_MAX_FILES = 5;
export const COPILOT_MAX_DOCUMENT_CHARACTERS = 100_000;
export const COPILOT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const COPILOT_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

const documentExtensions = new Set([".pdf", ".docx", ".pptx", ".txt", ".md"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".heif"]);

export type CopilotFileKind = "document" | "image" | "unsupported";

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
  return status === "READY" || status === "PENDING" || status === "FAILED";
}

export function copilotExtractionNeedsIndexing(status: string) {
  return status === "PENDING" || status === "FAILED";
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
  await indexDriveFile(record.id);
  return db.driveFile.findUniqueOrThrow({ where: { id: record.id } });
}

export async function assertDriveMoveAllowed(ownerId: string, fileId: string, parentId: string | null) {
  if (!parentId) return;
  let current = await db.driveFile.findFirst({ where: { id: parentId, ownerId, kind: "folder", deletedAt: null } });
  if (!current) throw new Error("目标文件夹不存在");
  const seen = new Set<string>();
  while (current) {
    if (current.id === fileId) throw new Error("不能把文件夹移动到自身或子文件夹中");
    if (!current.parentId || seen.has(current.id)) break;
    seen.add(current.id);
    current = await db.driveFile.findFirst({ where: { id: current.parentId, ownerId, deletedAt: null } });
  }
}

export async function indexDriveFile(fileId: string) {
  const file = await db.driveFile.findUnique({ where: { id: fileId } });
  if (!file || file.kind !== "file" || !file.path) throw new Error("文件不存在");
  const kind = copilotFileKind(file.name, file.mimeType);

  if (kind === "image") {
    await db.driveFile.update({
      where: { id: file.id },
      data: { extractionStatus: "READY", extractedText: null, extractionError: null, extractedAt: new Date() }
    });
    return;
  }
  if (kind === "unsupported") {
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
    const tooLarge = extracted.text.length > COPILOT_MAX_DOCUMENT_CHARACTERS;
    await db.driveFile.update({
      where: { id: file.id },
      data: {
        extractionStatus: tooLarge ? "TOO_LARGE" : "READY",
        extractedText: tooLarge ? extracted.text.slice(0, COPILOT_MAX_DOCUMENT_CHARACTERS + 1) : extracted.text,
        extractionError: tooLarge ? "文档正文超过 100,000 字符，暂不支持添加到对话" : null,
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

type DriveTreeRow = {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  mimeType: string | null;
  size: number;
  extractionStatus: string;
  extractionError: string | null;
};

function descendantIds(rows: DriveTreeRow[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  }
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of children.get(current) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      queue.push(child);
    }
  }
  return ids;
}

function filePath(rowsById: Map<string, DriveTreeRow>, file: DriveTreeRow, rootId: string) {
  const parts = [file.name];
  let current = file;
  const seen = new Set([current.id]);
  while (current.parentId && current.parentId !== rootId) {
    const parent = rowsById.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(" / ");
}

export async function listCourseCopilotFiles(user: SessionUser, courseId: string) {
  const course = await requireCourseAccess(user, courseId);
  if (!course.copilotFolderId) return [];
  const root = await db.driveFile.findFirst({
    where: { id: course.copilotFolderId, kind: "folder", deletedAt: null },
    select: { ownerId: true }
  });
  if (!root) return [];
  const rows = await db.driveFile.findMany({
    where: { ownerId: root.ownerId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      name: true,
      kind: true,
      mimeType: true,
      size: true,
      extractionStatus: true,
      extractionError: true
    }
  });
  const allowed = descendantIds(rows, course.copilotFolderId);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return rows
    .filter((row) => row.kind === "file" && allowed.has(row.id))
    .map((row) => {
      const contextKind = copilotFileKind(row.name, row.mimeType);
      const imageTooLarge = contextKind === "image" && row.size > COPILOT_MAX_IMAGE_BYTES;
      const supported = contextKind !== "unsupported" && !imageTooLarge;
      return {
        ...row,
        path: filePath(rowsById, row, course.copilotFolderId!),
        contextKind,
        contextReady: row.extractionStatus === "READY" && supported,
        contextSelectable: supported && copilotExtractionCanBeSelected(row.extractionStatus),
        extractionError: imageTooLarge ? "图片超过单张 10MB 限制" : row.extractionError
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function assertCourseCopilotFiles(user: SessionUser, courseId: string, fileIds: string[]) {
  if (fileIds.length > COPILOT_MAX_FILES || new Set(fileIds).size !== fileIds.length) {
    throw new Error(`每个对话最多添加 ${COPILOT_MAX_FILES} 个文件`);
  }
  let allowed = await listCourseCopilotFiles(user, courseId);
  let byId = new Map(allowed.map((file) => [file.id, file]));
  let files = fileIds.map((id) => byId.get(id));
  if (files.some((file) => !file)) throw new Error("文件不存在或不属于当前课程文件夹");
  if (files.some((file) => !file!.contextSelectable)) {
    const file = files.find((item) => item && !item.contextSelectable)!;
    throw new Error(file.extractionError || "文件当前不可用");
  }
  const indexingIds = files.filter((file) => copilotExtractionNeedsIndexing(file!.extractionStatus)).map((file) => file!.id);
  for (let offset = 0; offset < indexingIds.length; offset += 3) {
    await Promise.allSettled(indexingIds.slice(offset, offset + 3).map((fileId) => indexDriveFile(fileId)));
  }
  if (indexingIds.length) {
    allowed = await listCourseCopilotFiles(user, courseId);
    byId = new Map(allowed.map((file) => [file.id, file]));
    files = fileIds.map((id) => byId.get(id));
  }
  if (files.some((file) => !file!.contextReady)) {
    const file = files.find((item) => item && !item.contextReady)!;
    throw new Error(file.extractionError || "文件尚未完成解析");
  }
  const records = await db.driveFile.findMany({
    where: { id: { in: fileIds }, deletedAt: null },
    select: { id: true, name: true, size: true, mimeType: true, extractedText: true }
  });
  let documentCharacters = 0;
  let imageBytes = 0;
  for (const record of records) {
    if (copilotFileKind(record.name, record.mimeType) === "document") documentCharacters += record.extractedText?.length ?? 0;
    else imageBytes += record.size;
  }
  if (documentCharacters > COPILOT_MAX_DOCUMENT_CHARACTERS) throw new Error("文档正文合计不能超过 100,000 字符");
  if (imageBytes > COPILOT_MAX_TOTAL_IMAGE_BYTES) throw new Error("图片合计不能超过 20MB");
  return files as NonNullable<(typeof files)[number]>[];
}

export async function buildCopilotFileContext(fileIds: string[]) {
  const files = await db.driveFile.findMany({ where: { id: { in: fileIds }, deletedAt: null } });
  const ordered = fileIds.map((id) => files.find((file) => file.id === id)).filter(Boolean) as typeof files;
  let documentCharacters = 0;
  let imageBytes = 0;
  const documents: Array<{ name: string; text: string }> = [];
  const images: Array<{ name: string; mimeType: string; data: string }> = [];

  for (const file of ordered) {
    const kind = copilotFileKind(file.name, file.mimeType);
    if (kind === "document") {
      if (file.extractionStatus !== "READY" || !file.extractedText) throw new Error(`${file.name} 尚未完成解析`);
      documentCharacters += file.extractedText.length;
      if (documentCharacters > COPILOT_MAX_DOCUMENT_CHARACTERS) throw new Error("文档正文合计不能超过 100,000 字符");
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
  return { documents, images, documentCharacters, imageBytes };
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
      copilotCourses: { select: { id: true, title: true }, orderBy: { title: "asc" } }
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
    return { id: row.id, name: row.name, path: parts.join(" / "), boundCourses: row.copilotCourses };
  }).sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export async function assertOwnerFolder(user: SessionUser, folderId: string) {
  const folder = await db.driveFile.findFirst({
    where: { id: folderId, ownerId: user.id, kind: "folder", deletedAt: null }
  });
  if (!folder) throw new Error("云盘文件夹不存在或无权访问");
  return folder;
}
