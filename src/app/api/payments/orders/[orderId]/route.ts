import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cancelRechargeOrder, getRechargeOrderForUser, PaymentError, serializePaymentOrder } from "@/lib/billing/payment-service";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (user.role !== "TEACHER") return NextResponse.json({ error: "仅教师账户可以取消充值订单" }, { status: 403 });
  const { orderId } = await context.params;
  try {
    const order = await cancelRechargeOrder(user.id, orderId);
    return NextResponse.json({ order: serializePaymentOrder(order) });
  } catch (error) {
    if (error instanceof PaymentError) {
      const status = error.code === "PAYMENT_ORDER_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ code: error.code, error: error.message }, { status });
    }
    return NextResponse.json({ error: "充值订单取消失败" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  if (user.role !== "TEACHER") return NextResponse.json({ error: "仅教师账户可以查看充值订单" }, { status: 403 });
  const { orderId } = await context.params;
  try {
    const order = await getRechargeOrderForUser(user.id, orderId);
    return NextResponse.json({ order: serializePaymentOrder(order) });
  } catch (error) {
    if (error instanceof PaymentError) return NextResponse.json({ code: error.code, error: error.message }, { status: 404 });
    return NextResponse.json({ error: "充值订单查询失败" }, { status: 500 });
  }
}
