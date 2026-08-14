import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getZoviiLinkStatus } from "@/lib/zovii/linkAccount";

export async function GET() {
  const user = await requireUser();
  const status = await getZoviiLinkStatus(user.id);
  return NextResponse.json({ status });
}
