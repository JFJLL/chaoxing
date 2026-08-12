import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { changePasswordSchema } from "@/lib/validation/auth";

export async function POST(request: NextRequest) {
  const sessionUser = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { passwordHash: true }
  });
  if (!user) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }

  const currentPasswordIsValid = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash
  );
  if (!currentPasswordIsValid) {
    return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
  }

  await db.user.update({
    where: { id: sessionUser.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) }
  });

  return NextResponse.json({ ok: true });
}
