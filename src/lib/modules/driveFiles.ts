import { readFile } from "fs/promises";
import { basename } from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function streamDriveFile(fileId: string) {
  const file = await db.driveFile.findUnique({ where: { id: fileId } });
  if (!file || file.kind !== "file" || !file.path) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const bytes = await readFile(file.path);
  return new NextResponse(bytes, {
    headers: {
      "content-type": file.mimeType || "application/octet-stream",
      "content-disposition": `attachment; filename="${encodeURIComponent(basename(file.name))}"`
    }
  });
}
