import { createHash, createHmac, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { basename, extname, join } from "path";

const SUPPORTED_EXTENSIONS = new Set([".docx", ".pdf", ".pptx", ".txt", ".md"]);

export function getUploadDir() {
  return process.env.UPLOAD_DIR || "./.uploads";
}

function importStorageProvider() {
  return (process.env.IMPORT_STORAGE_PROVIDER || "local").toLowerCase();
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

export function maxCourseUploadBytes() {
  const value = Number(process.env.MAX_COURSE_UPLOAD_MB || 1024);
  const sizeMb = Number.isFinite(value) && value > 0 ? value : 1024;
  return sizeMb * 1024 * 1024;
}

export function assertCourseUploadQuota(currentBytes: number, nextBytes: number) {
  const maxBytes = maxCourseUploadBytes();
  if (currentBytes + nextBytes > maxBytes) {
    throw new Error(`课程上传总量不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }
}

export function maxInstitutionUploadBytes() {
  const value = Number(process.env.MAX_INSTITUTION_UPLOAD_MB || 10_240);
  const sizeMb = Number.isFinite(value) && value > 0 ? value : 10_240;
  return sizeMb * 1024 * 1024;
}

export function assertInstitutionUploadQuota(currentBytes: number, nextBytes: number) {
  const maxBytes = maxInstitutionUploadBytes();
  if (currentBytes + nextBytes > maxBytes) {
    throw new Error(`学校上传总量不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }
}

export async function storeImportFile(input: {
  jobId: string;
  fileName: string;
  bytes: Buffer;
}) {
  const extension = assertSupportedUpload(input.fileName);
  if (importStorageProvider() === "s3") {
    return storeImportFileToS3({ ...input, extension });
  }

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, `${input.jobId}${extension}`);
  await writeFile(filePath, input.bytes);
  return filePath;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when IMPORT_STORAGE_PROVIDER=s3`);
  return value;
}

function sha256Hex(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function amzDateParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodeS3Path(value: string) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function signingKey(secret: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function s3Config() {
  return {
    endpoint: new URL(requiredEnv("S3_ENDPOINT")),
    region: process.env.S3_REGION || "auto",
    bucket: requiredEnv("S3_BUCKET"),
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    prefix: (process.env.S3_PREFIX || "imports").replace(/^\/+|\/+$/g, "")
  };
}

function s3ObjectUrl(bucket: string, key: string, endpoint: URL) {
  const url = new URL(endpoint.toString());
  url.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${bucket}/${key}`.replace(/\/{2,}/g, "/");
  url.search = "";
  return url;
}

function s3Authorization(input: {
  method: "GET" | "PUT";
  url: URL;
  bodyHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  now?: Date;
}) {
  const { amzDate, dateStamp } = amzDateParts(input.now);
  const canonicalUri = encodeS3Path(input.url.pathname);
  const canonicalHeaders = `host:${input.url.host}\nx-amz-content-sha256:${input.bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `${input.method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${input.bodyHash}`;
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const signature = hmacHex(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign);
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate
  };
}

function s3Key(jobId: string, extension: string) {
  const { prefix } = s3Config();
  return `${prefix}/${jobId}${extension}`;
}

async function storeImportFileToS3(input: { jobId: string; fileName: string; bytes: Buffer; extension: string }) {
  const config = s3Config();
  const key = s3Key(input.jobId, input.extension);
  const url = s3ObjectUrl(config.bucket, key, config.endpoint);
  const bodyHash = sha256Hex(input.bytes);
  const signed = s3Authorization({
    method: "PUT",
    url,
    bodyHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region
  });
  const response = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(input.bytes),
    headers: {
      Authorization: signed.authorization,
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": signed.amzDate,
      "content-type": "application/octet-stream"
    }
  });

  if (!response.ok) {
    throw new Error(`对象存储上传失败：${response.status}`);
  }

  return `s3://${config.bucket}/${key}`;
}

function parseS3Uri(uri: string) {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error("对象存储地址无效");
  return { bucket: match[1], key: match[2] };
}

async function downloadS3Object(uri: string) {
  const config = s3Config();
  const { bucket, key } = parseS3Uri(uri);
  const url = s3ObjectUrl(bucket, key, config.endpoint);
  const bodyHash = sha256Hex("");
  const signed = s3Authorization({
    method: "GET",
    url,
    bodyHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region
  });
  const response = await fetch(url, {
    headers: {
      Authorization: signed.authorization,
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": signed.amzDate
    }
  });

  if (!response.ok) {
    throw new Error(`对象存储下载失败：${response.status}`);
  }

  const cacheDir = join(getUploadDir(), "cache");
  await mkdir(cacheDir, { recursive: true });
  const filePath = join(cacheDir, `${randomUUID()}-${basename(key)}`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

export async function withImportFilePath<T>(filePath: string, callback: (localPath: string) => Promise<T>) {
  if (!filePath.startsWith("s3://")) {
    return callback(filePath);
  }

  const localPath = await downloadS3Object(filePath);
  try {
    return await callback(localPath);
  } finally {
    await unlink(localPath).catch(() => undefined);
  }
}

const INBOX_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const INBOX_DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".txt", ".md"]);

export function assertInboxAttachment(fileName: string, mimeType: string | null | undefined, size: number) {
  const extension = extname(fileName).toLowerCase();
  const isImage = INBOX_IMAGE_EXTENSIONS.has(extension) && Boolean(mimeType?.startsWith("image/"));
  const isDocument = INBOX_DOCUMENT_EXTENSIONS.has(extension);
  if (!isImage && !isDocument) throw new Error("附件仅支持 JPG、PNG、WEBP、PDF、DOCX、PPTX、TXT、Markdown 文件");
  const maxBytes = 15 * 1024 * 1024;
  if (size <= 0 || size > maxBytes) throw new Error("单个收信箱附件需小于 15MB");
  return { kind: isImage ? "IMAGE" : "FILE", extension } as const;
}

export async function storeInboxAttachment(input: { messageId: string; fileName: string; bytes: Buffer }) {
  const safeName = basename(input.fileName).replace(/[^\w.\-\u4e00-\u9fff]/g, "_").slice(-120) || "attachment";
  const root = join(getUploadDir(), "inbox", input.messageId);
  await mkdir(root, { recursive: true });
  const filePath = join(root, `${randomUUID()}-${safeName}`);
  await writeFile(filePath, input.bytes);
  return filePath;
}

export async function readInboxAttachment(storagePath: string) {
  const root = join(getUploadDir(), "inbox");
  if (!storagePath.startsWith(root)) throw new Error("附件路径无效");
  return readFile(storagePath);
}

export async function storeGeneratedCoursewareImage(input: {
  artifactId: string;
  pageNo: number;
  bytes: Buffer;
}) {
  const root = join(getUploadDir(), "generated-courseware", input.artifactId);
  await mkdir(root, { recursive: true });
  const filePath = join(root, `slide-${input.pageNo}.png`);
  await writeFile(filePath, input.bytes);
  return filePath;
}
