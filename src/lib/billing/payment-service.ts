import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { creditRechargeInTransaction } from "@/lib/billing/credit-service";
import { closeAlipayOrder, createAlipayNativePayment } from "@/lib/payments/alipay";
import { getRechargePlan, isPaymentProvider, type PaymentProvider } from "@/lib/payments/config";
import { closeWxpayOrder, createWxpayNativePayment } from "@/lib/payments/wxpay";

const ORDER_EXPIRY_MS = 30 * 60 * 1_000;

export class PaymentError extends Error {
  constructor(
    public readonly code: "PAYMENT_PROVIDER_DISABLED" | "PAYMENT_PLAN_INVALID" | "PAYMENT_ORDER_NOT_FOUND" | "PAYMENT_AMOUNT_MISMATCH" | "PAYMENT_PROVIDER_MISMATCH" | "PAYMENT_ORDER_CANNOT_CANCEL",
    message: string
  ) {
    super(message);
  }
}

export function createOutTradeNo() {
  return `cx_${Date.now()}_${randomBytes(7).toString("hex")}`;
}

export function serializePaymentOrder(order: {
  id: string;
  outTradeNo: string;
  planId: string;
  planName: string;
  planCredits: number;
  planBaseCredits: number;
  planBonusCredits: number;
  amountFen: number;
  provider: string;
  status: string;
  expiresAt: Date;
  paidAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: order.id,
    outTradeNo: order.outTradeNo,
    planId: order.planId,
    planName: order.planName,
    planCredits: order.planCredits,
    planBaseCredits: order.planBaseCredits,
    planBonusCredits: order.planBonusCredits,
    amountFen: order.amountFen,
    amountYuan: (order.amountFen / 100).toFixed(2),
    provider: order.provider,
    status: order.status,
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

export async function createRechargeOrder(input: {
  userId: string;
  planId: string;
  provider: PaymentProvider;
  idempotencyKey: string;
}) {
  const plan = getRechargePlan(input.planId);
  if (!plan) throw new PaymentError("PAYMENT_PLAN_INVALID", "充值套餐不存在或已下架");
  if (!isPaymentProvider(input.provider)) throw new PaymentError("PAYMENT_PROVIDER_DISABLED", "不支持的支付方式");

  const now = new Date();
  let order = await db.paymentOrder.findUnique({
    where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } }
  });
  if (!order) {
    order = await db.paymentOrder.create({
      data: {
        userId: input.userId,
        outTradeNo: createOutTradeNo(),
        idempotencyKey: input.idempotencyKey,
        planId: plan.id,
        planName: plan.name,
        planCredits: plan.credits,
        planBaseCredits: plan.baseCredits,
        planBonusCredits: plan.bonusCredits,
        amountFen: plan.amountFen,
        provider: input.provider,
        status: "CREATED",
        expiresAt: new Date(now.getTime() + ORDER_EXPIRY_MS)
      }
    });
  }

  if (order.provider !== input.provider) {
    throw new PaymentError("PAYMENT_PROVIDER_MISMATCH", "同一提交凭据不能更换支付方式");
  }
  if (order.status === "PAID") return { order, access: null };
  if (order.expiresAt <= now) {
    order = await db.paymentOrder.update({ where: { id: order.id }, data: { status: "EXPIRED" } });
    return { order, access: null };
  }
  if (order.paymentPayload) return { order, access: JSON.parse(order.paymentPayload) as Record<string, string> };

  try {
    const access = input.provider === "ALIPAY"
      ? { kind: "QRCODE" as const, qrCode: await createAlipayNativePayment({ outTradeNo: order.outTradeNo, subject: `Chaoxing ${plan.name}`, amountFen: plan.amountFen }) }
      : { kind: "QRCODE" as const, qrCode: await createWxpayNativePayment({ outTradeNo: order.outTradeNo, description: `Chaoxing ${plan.name}`, amountFen: plan.amountFen }) };
    order = await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: "PENDING", paymentPayload: JSON.stringify(access) }
    });
    return { order, access };
  } catch (error) {
    await db.paymentOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
    throw error;
  }
}

export async function getRechargeOrderForUser(userId: string, orderId: string) {
  const order = await db.paymentOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new PaymentError("PAYMENT_ORDER_NOT_FOUND", "充值订单不存在");
  return order;
}

export async function settleRechargeOrder(input: {
  provider: PaymentProvider;
  providerEventId: string;
  providerTradeNo: string;
  outTradeNo: string;
  amountFen: number;
  payload: unknown;
}) {
  return db.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({ where: { outTradeNo: input.outTradeNo } });
    if (!order) throw new PaymentError("PAYMENT_ORDER_NOT_FOUND", "充值订单不存在");
    if (order.provider !== input.provider) throw new PaymentError("PAYMENT_PROVIDER_MISMATCH", "支付渠道与订单不一致");
    if (order.amountFen !== input.amountFen) throw new PaymentError("PAYMENT_AMOUNT_MISMATCH", "支付金额与充值订单不一致");

    await tx.paymentEvent.upsert({
      where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } },
      create: {
        orderId: order.id,
        provider: input.provider,
        providerEventId: input.providerEventId,
        verified: true,
        payload: JSON.stringify(input.payload)
      },
      update: { orderId: order.id, verified: true }
    });

    if (order.status !== "PAID") {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "PAID", providerTradeNo: input.providerTradeNo, paidAt: new Date() }
      });
    }
    await creditRechargeInTransaction(tx, {
      userId: order.userId,
      orderId: order.id,
      credits: order.planCredits,
      description: `充值到账：${order.planName}（基础 ${order.planBaseCredits} 积分${order.planBonusCredits > 0 ? ` + 赠送 ${order.planBonusCredits} 积分` : ""}）`,
      metadata: { outTradeNo: order.outTradeNo, provider: input.provider, providerTradeNo: input.providerTradeNo, baseCredits: order.planBaseCredits, bonusCredits: order.planBonusCredits }
    });
    return tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
  });
}

function isAlipayTradeNotExist(result: Record<string, unknown> | undefined) {
  return String(result?.sub_code ?? "") === "ACQ.TRADE_NOT_EXIST";
}

export async function cancelRechargeOrder(userId: string, orderId: string) {
  const order = await getRechargeOrderForUser(userId, orderId);
  if (order.status === "PAID") throw new PaymentError("PAYMENT_ORDER_CANNOT_CANCEL", "订单已支付，不能取消；如余额未到账请稍后刷新");
  if (["CLOSED", "EXPIRED"].includes(order.status)) return order;
  if (!(["CREATED", "PENDING"].includes(order.status))) {
    throw new PaymentError("PAYMENT_ORDER_CANNOT_CANCEL", "当前订单状态不能取消");
  }
  if (order.expiresAt <= new Date()) {
    return db.paymentOrder.update({ where: { id: order.id }, data: { status: "EXPIRED", paymentPayload: null, closedAt: new Date() } });
  }
  try {
    if (order.status === "PENDING") {
      if (order.provider === "ALIPAY") {
        const result = await closeAlipayOrder(order.outTradeNo);
        if (String(result?.code ?? "") !== "10000" && !isAlipayTradeNotExist(result)) {
          throw new Error(String(result?.sub_msg ?? result?.msg ?? "支付宝未确认订单关闭"));
        }
        // 订单码支付的预创建二维码在用户尚未扫码形成支付宝交易时，关闭接口会返回
        // ACQ.TRADE_NOT_EXIST。此时二维码已无法继续支付，可安全结束本地待付款订单。
      } else {
        await closeWxpayOrder(order.outTradeNo);
      }
    }
  } catch (error) {
    throw new PaymentError("PAYMENT_ORDER_CANNOT_CANCEL", error instanceof Error ? `订单取消失败：${error.message}` : "订单取消失败，请稍后重试");
  }
  const closed = await db.paymentOrder.updateMany({
    where: { id: order.id, userId, status: { in: ["CREATED", "PENDING"] } },
    data: { status: "CLOSED", paymentPayload: null, closedAt: new Date() }
  });
  if (!closed.count) throw new PaymentError("PAYMENT_ORDER_CANNOT_CANCEL", "订单状态已变化，请刷新后查看结果");
  return db.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
}

export async function listRechargeOrders(userId: string) {
  return db.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
}

export function isPrismaUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
