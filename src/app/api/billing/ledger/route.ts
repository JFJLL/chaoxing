import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCreditAccountSummary } from "@/lib/billing/credit-service";

export async function GET() {
  const user = await requireUser();
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "仅教师账户可以查看积分流水" }, { status: 403 });
  }
  const { account, ledgers } = await getCreditAccountSummary(user.id);
  return NextResponse.json({
    account: { available: account.available, reserved: account.reserved },
    ledgers: ledgers.map((ledger) => ({
      id: ledger.id,
      type: ledger.type,
      availableDelta: ledger.availableDelta,
      reservedDelta: ledger.reservedDelta,
      description: ledger.description,
      referenceType: ledger.referenceType,
      createdAt: ledger.createdAt.toISOString()
    }))
  });
}
