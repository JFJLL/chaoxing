import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const box = request.nextUrl.searchParams.get("box") || "inbox";
  const where =
    box === "sent"
      ? { senderId: user.id, deletedBySenderAt: null }
      : box === "archived"
        ? { receiverId: user.id, archivedAt: { not: null }, deletedByReceiverAt: null }
        : { receiverId: user.id, archivedAt: null, deletedByReceiverAt: null };
  const messages = await db.message.findMany({ where, include: { sender: true, receiver: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = (await request.json()) as { receiverId: string; subject: string; body: string };
  const message = await db.message.create({ data: { senderId: user.id, receiverId: body.receiverId, subject: body.subject, body: body.body } });
  return NextResponse.json({ message }, { status: 201 });
}
