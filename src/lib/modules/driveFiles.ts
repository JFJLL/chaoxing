import { createHmac, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { basename, join } from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUploadDir } from "@/lib/storage";

function driveStorageProvider() {
  return (process.env.DRIVE_STORAGE_PROVIDER || "oss").toLowerCase();
}

function requiredOssEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when DRIVE_STORAGE_PROVIDER=oss`);
  return value;
}

function ossConfig() {
  return {
    endpoint: new URL(requiredOssEnv("ALIYUN_OSS_ENDPOINT")),
    bucket: requiredOssEnv("ALIYUN_OSS_BUCKET"),
    accessKeyId: requiredOssEnv("ALIYUN_OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredOssEnv("ALIYUN_OSS_ACCESS_KEY_SECRET"),
    prefix: (process.env.ALIYUN_OSS_PREFIX || "drive").replace(/^\/+|\/+$/g, "")
  };
}

function encodeObjectKey(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function ossObjectUrl(bucket: string, key: string, endpoint: URL) {
  const url = new URL(endpoint.toString());
  url.host = endpoint.hostname.startsWith(`${bucket}.`) ? endpoint.host : `${bucket}.${endpoint.host}`;
  url.pathname = `/${encodeObjectKey(key)}`;
  url.search = "";
  return url;
}

function ossAuthorization(input: {
  method: "DELETE" | "GET" | "PUT";
  bucket: string;
  key: string;
  contentType: string;
  accessKeyId: string;
  accessKeySecret: string;
  now?: Date;
}) {
  const date = (input.now || new Date()).toUTCString();
  const canonicalizedResource = `/${input.bucket}/${input.key}`;
  const stringToSign = `${input.method}\n\n${input.contentType}\n${date}\n${canonicalizedResource}`;
  const signature = createHmac("sha1", input.accessKeySecret).update(stringToSign).digest("base64");
  return { date, authorization: `OSS ${input.accessKeyId}:${signature}` };
}

function safeObjectName(fileName: string) {
  return basename(fileName).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "_").trim() || "file";
}

function ossKey(ownerId: string, fileName: string) {
  const config = ossConfig();
  return `${config.prefix}/${ownerId}/${randomUUID()}/${safeObjectName(fileName)}`;
}

async function uploadDriveFileToOss(input: { ownerId: string; fileName: string; bytes: Buffer; mimeType?: string | null }) {
  const config = ossConfig();
  const key = ossKey(input.ownerId, input.fileName);
  const contentType = input.mimeType || "application/octet-stream";
  const url = ossObjectUrl(config.bucket, key, config.endpoint);
  const signed = ossAuthorization({
    method: "PUT",
    bucket: config.bucket,
    key,
    contentType,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret
  });

  const response = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(input.bytes),
    headers: {
      Authorization: signed.authorization,
      Date: signed.date,
      "content-type": contentType
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`阿里云 OSS 上传失败：${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`);
  }

  return `oss://${config.bucket}/${key}`;
}

function parseOssUri(uri: string) {
  const match = uri.match(/^oss:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error("OSS 文件地址无效");
  return { bucket: match[1], key: match[2] };
}

async function downloadDriveFileFromOss(uri: string) {
  const config = ossConfig();
  const { bucket, key } = parseOssUri(uri);
  const url = ossObjectUrl(bucket, key, config.endpoint);
  const signed = ossAuthorization({
    method: "GET",
    bucket,
    key,
    contentType: "",
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret
  });

  const response = await fetch(url, {
    headers: {
      Authorization: signed.authorization,
      Date: signed.date
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`阿里云 OSS 下载失败：${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function deleteDriveFileFromOss(uri: string) {
  const config = ossConfig();
  const { bucket, key } = parseOssUri(uri);
  const url = ossObjectUrl(bucket, key, config.endpoint);
  const signed = ossAuthorization({
    method: "DELETE",
    bucket,
    key,
    contentType: "",
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret
  });
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: signed.authorization,
      Date: signed.date
    }
  });
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(`阿里云 OSS 删除失败：${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`);
  }
}

export type DriveFileStorageRecord = {
  id?: string;
  kind: string;
  name: string;
  mimeType: string | null;
  path: string | null;
};

export async function readDriveFileBytes(file: DriveFileStorageRecord) {
  if (file.kind !== "file" || !file.path) throw new Error("文件不存在");
  return file.path.startsWith("oss://")
    ? downloadDriveFileFromOss(file.path)
    : readFile(file.path);
}

export async function deleteDriveFileFromStorage(file: DriveFileStorageRecord) {
  if (file.kind !== "file" || !file.path) return;
  if (file.path.startsWith("oss://")) {
    await deleteDriveFileFromOss(file.path);
    return;
  }
  await unlink(file.path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function withDriveFilePath<T>(file: DriveFileStorageRecord, callback: (localPath: string) => Promise<T>) {
  if (file.kind !== "file" || !file.path) throw new Error("文件不存在");
  if (!file.path.startsWith("oss://")) return callback(file.path);

  const cacheDir = join(getUploadDir(), "cache");
  await mkdir(cacheDir, { recursive: true });
  const localPath = join(cacheDir, `${randomUUID()}-${safeObjectName(file.name)}`);
  await writeFile(localPath, await readDriveFileBytes(file));
  try {
    return await callback(localPath);
  } finally {
    await unlink(localPath).catch(() => undefined);
  }
}

export async function storeDriveFile(input: { ownerId: string; fileName: string; bytes: Buffer; mimeType?: string | null }) {
  if (driveStorageProvider() === "local") {
    const dir = join(getUploadDir(), "drive");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${Date.now()}-${randomUUID()}-${safeObjectName(input.fileName)}`);
    await writeFile(filePath, input.bytes);
    return filePath;
  }

  if (driveStorageProvider() === "oss") {
    return uploadDriveFileToOss(input);
  }

  throw new Error("DRIVE_STORAGE_PROVIDER 仅支持 oss 或 local");
}

export async function streamDriveFile(fileId: string, disposition: "attachment" | "inline" = "attachment") {
  const file = await db.driveFile.findUnique({ where: { id: fileId } });
  if (!file || file.kind !== "file" || !file.path) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const contentType = file.mimeType || "application/octet-stream";
  const bytes = await readDriveFileBytes(file);
  return new NextResponse(bytes, {
    headers: {
      "content-type": contentType,
      "content-disposition": `${disposition}; filename="${encodeURIComponent(basename(file.name))}"`
    }
  });
}
