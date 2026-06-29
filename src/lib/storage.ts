import { mkdir, writeFile } from "fs/promises";
import { extname, join } from "path";

const SUPPORTED_EXTENSIONS = new Set([".docx", ".pdf", ".pptx", ".txt", ".md"]);

export function getUploadDir() {
  return process.env.UPLOAD_DIR || "./.uploads";
}

export function assertSupportedUpload(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("仅支持 DOCX、PDF、PPTX、TXT、Markdown 文档");
  }
  return extension;
}

export function maxUploadBytes() {
  const value = Number(process.env.MAX_FILE_SIZE_MB || 50);
  const sizeMb = Number.isFinite(value) && value > 0 ? value : 50;
  return sizeMb * 1024 * 1024;
}

export function assertUploadSize(size: number) {
  const maxBytes = maxUploadBytes();
  if (size > maxBytes) {
    throw new Error(`文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }
}

export async function storeImportFile(input: {
  jobId: string;
  fileName: string;
  bytes: Buffer;
}) {
  const extension = assertSupportedUpload(input.fileName);
  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, `${input.jobId}${extension}`);
  await writeFile(filePath, input.bytes);
  return filePath;
}
