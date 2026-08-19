import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readInboxAttachment } from "@/lib/storage";

type RouteContext = { params: Promise<{ messageId: string; attachmentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { messageId, attachmentId } = await context.params;
  const attachment = await db.messageAttachment.findFirst({
    where: { id: attachmentId, messageId, message: { OR: [{ senderId: user.id }, { receiverId: user.id }] } },
    select: { kind: true, fileName: true, mimeType: true, storagePath: true, driveFileId: true }
  });
  if (!attachment) return NextResponse.json({ error: "附件不存在或无权访问" }, { status: 404 });
  if (attachment.kind === "REFERENCE_FILE") {
    return NextResponse.json({ error: "该附件为云盘引用，请在云盘中打开", driveFileId: attachment.driveFileId }, { status: 409 });
  }
  if (!attachment.storagePath) return NextResponse.json({ error: "附件内容不可用" }, { status: 404 });
  try {
    const bytes = await readInboxAttachment(attachment.storagePath);
    const inline = attachment.kind === "IMAGE";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": attachment.mimeType || "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "cache-control": "private, max-age=300"
      }
    });
  } catch {
    return NextResponse.json({ error: "附件读取失败" }, { status: 404 });
  }
}
