import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { EnterpriseAccessError, revokeIntegrationAdmin } from "@/lib/zovii/enterprise";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "只有学校管理员可以撤销集成管理员" }, { status: 403 });
  }
  const { userId } = await context.params;
  try {
    await revokeIntegrationAdmin({
      institutionId: user.institutionId,
      targetUserId: userId,
      revokedById: user.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "TARGET_NOT_FOUND" ? 404 : 403 }
      );
    }
    return NextResponse.json({ error: "撤销失败，请稍后重试" }, { status: 502 });
  }
}
