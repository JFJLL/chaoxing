import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertInboxAttachment, storeInboxAttachment } from "@/lib/storage";

function inboxWhere(userId: string, box: string) {
  return box === "sent"
    ? { senderId: userId, deletedBySenderAt: null }
    : box === "archived"
      ? { receiverId: userId, archivedAt: { not: null }, deletedByReceiverAt: null }
      : { receiverId: userId, archivedAt: null, deletedByReceiverAt: null };
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user.role === "ADMIN") return NextResponse.json({ messages: [] });
  const box = request.nextUrl.searchParams.get("box") || "inbox";
  const messages = await db.message.findMany({
    where: inboxWhere(user.id, box),
    include: { sender: { select: { id: true, name: true, role: true } }, receiver: { select: { id: true, name: true, role: true } }, attachments: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ messages: messages.filter((message) => message.sender.role !== "ADMIN" && message.receiver.role !== "ADMIN") });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (user.role === "ADMIN") return NextResponse.json({ error: "管理员账号不使用普通收信箱" }, { status: 403 });
  try {
    const form = await request.formData();
    const receiverId = String(form.get("receiverId") ?? "").trim();
    const subject = String(form.get("subject") ?? "").trim().slice(0, 120);
    const body = String(form.get("body") ?? "").trim().slice(0, 10_000);
    const referenceFileIds = JSON.parse(String(form.get("referenceFileIds") ?? "[]")) as unknown;
    const files = form.getAll("attachments").filter((item): item is File => typeof item !== "string" && item.size > 0);
    if (!receiverId || !subject || !body) return NextResponse.json({ error: "请填写收件人、主题和消息内容" }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: "每条消息最多附带 10 个本地附件" }, { status: 400 });
    if (!Array.isArray(referenceFileIds) || referenceFileIds.length > 10 || referenceFileIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "每条消息最多引用 10 个云盘文件" }, { status: 400 });
    }
    const uniqueReferenceFileIds = [...new Set(referenceFileIds)];
    if (uniqueReferenceFileIds.length !== referenceFileIds.length) {
      return NextResponse.json({ error: "云盘引用文件不能重复选择" }, { status: 400 });
    }
    const receiver = await db.user.findFirst({ where: { id: receiverId, institutionId: user.institutionId, role: { not: "ADMIN" } }, select: { id: true } });
    if (!receiver || receiver.id === user.id) return NextResponse.json({ error: "收件人不可用" }, { status: 400 });
    const references = uniqueReferenceFileIds.length ? await db.driveFile.findMany({
      where: { id: { in: uniqueReferenceFileIds }, ownerId: user.id, kind: "file", deletedAt: null },
      select: { id: true, name: true, mimeType: true, size: true }
    }) : [];
    if (references.length !== uniqueReferenceFileIds.length) return NextResponse.json({ error: "只能引用自己云盘中仍可用的文件" }, { status: 400 });

    const messageId = randomUUID();
    const stored = await Promise.all(files.map(async (file) => {
      const validated = assertInboxAttachment(file.name, file.type, file.size);
      const storagePath = await storeInboxAttachment({ messageId, fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
      return { kind: validated.kind, fileName: file.name.slice(0, 180), mimeType: file.type || null, byteSize: file.size, storagePath };
    }));
    const message = await db.message.create({
      data: {
        id: messageId,
        senderId: user.id,
        receiverId: receiver.id,
        subject,
        body,
        attachments: { create: [
          ...stored,
          ...references.map((file) => ({ kind: "REFERENCE_FILE", fileName: file.name, mimeType: file.mimeType, byteSize: file.size, driveFileId: file.id }))
        ] }
      },
      include: { sender: { select: { id: true, name: true, role: true } }, receiver: { select: { id: true, name: true, role: true } }, attachments: true }
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "消息发送失败" }, { status: 400 });
  }
}
