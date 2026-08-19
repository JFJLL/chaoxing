import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createRechargeOrder, listRechargeOrders, PaymentError, serializePaymentOrder } from "@/lib/billing/payment-service";
import { isPaymentProvider } from "@/lib/payments/config";

const createOrderSchema = z.object({
  planId: z.string().trim().min(1).max(100),
  provider: z.enum(["ALIPAY", "WXPAY"]),
  idempotencyKey: z.string().trim().min(8).max(200).optional()
}).strict();

function paymentErrorResponse(error: unknown) {
  if (error instanceof PaymentError) {
    const status = error.code === "PAYMENT_PLAN_INVALID" ? 400 : error.code === "PAYMENT_PROVIDER_DISABLED" ? 503 : 409;
    return NextResponse.json({ code: error.code, error: error.message }, { status });
  }
  return NextResponse.json({ code: "PAYMENT_ORDER_FAILED", error: "充值订单创建失败，请稍后重试" }, { status: 500 });
}

export async function GET() {
  const user = await requireUser();
  if (user.role !== "TEACHER") return NextResponse.json({ error: "仅教师账户可以充值积分" }, { status: 403 });
  const orders = await listRechargeOrders(user.id);
  return NextResponse.json({ orders: orders.map(serializePaymentOrder) });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (user.role !== "TEACHER") return NextResponse.json({ error: "仅教师账户可以充值积分" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success || !isPaymentProvider(parsed.data?.provider)) {
    return NextResponse.json({ error: "充值参数无效" }, { status: 400 });
  }

  try {
    const idempotencyKey = parsed.data.idempotencyKey ?? request.headers.get("idempotency-key")?.trim() ?? randomUUID();
    const result = await createRechargeOrder({
      userId: user.id,
      planId: parsed.data.planId,
      provider: parsed.data.provider,
      idempotencyKey
    });
    return NextResponse.json({ order: serializePaymentOrder(result.order), access: result.access }, { status: 201 });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
