import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const q = request.nextUrl.searchParams.get("q") || "";
  const role = request.nextUrl.searchParams.get("role") || undefined;
  const contacts = await db.user.findMany({
    where: { institutionId: user.institutionId, name: { contains: q }, role },
    include: { institution: true },
    orderBy: [{ role: "asc" }, { name: "asc" }]
  });
  return NextResponse.json({ contacts });
}
