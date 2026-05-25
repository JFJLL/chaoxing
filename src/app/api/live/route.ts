import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  const sessions = await db.liveSession.findMany({
    where: { OR: [{ hostId: user.id }, { participants: { some: { userId: user.id } } }] },
    include: { participants: true, messages: { include: { user: true } }, host: true },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = (await request.json()) as { title: string; description?: string; startsAt?: string };
  const session = await db.liveSession.create({ data: { title: body.title, description: body.description || "", hostId: user.id, startsAt: body.startsAt ? new Date(body.startsAt) : null } });
  return NextResponse.json({ session }, { status: 201 });
}
