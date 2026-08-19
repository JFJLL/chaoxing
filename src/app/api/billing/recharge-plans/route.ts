import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { publicRechargePlans } from "@/lib/payments/config";

export async function GET() {
  const user = await requireUser();
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "仅教师账户可以充值积分" }, { status: 403 });
  }
  return NextResponse.json(publicRechargePlans());
}
