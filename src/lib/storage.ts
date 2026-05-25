import { mkdir, writeFile } from "fs/promises";
import { extname, join } from "path";

const SUPPORTED_EXTENSIONS = new Set([".docx", ".pdf", ".txt", ".md"]);

export function getUploadDir() {
  return process.env.UPLOAD_DIR || "./.uploads";
}

export function assertSupportedUpload(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("仅支持 DOCX、PDF、TXT、Markdown 文档");
  }
  return extension;
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
