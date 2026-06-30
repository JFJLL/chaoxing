import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireDriveFileOwner } from "@/lib/modules/drivePermissions";
import { requireTeacher } from "@/lib/permissions";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { fileId } = await context.params;
  try {
    requireTeacher(user);
    await requireDriveFileOwner(user, fileId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理文件" }, { status: 403 });
  }

  const code = `DRIVE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const share = await db.driveShare.create({ data: { fileId, ownerId: user.id, code } });
  await db.inviteCode.create({ data: { code, kind: "DRIVE_SHARE", targetId: fileId, maxUses: 100 } });
  return NextResponse.json({ share, link: `/api/drive/${fileId}?download=1` }, { status: 201 });
}
