import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  closeAlipayOrder: vi.fn(),
  closeWxpayOrder: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentOrder: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      findUniqueOrThrow: mocks.findUniqueOrThrow
    }
  }
}));

vi.mock("@/lib/payments/alipay", () => ({
  closeAlipayOrder: mocks.closeAlipayOrder,
  createAlipayNativePayment: vi.fn()
}));

vi.mock("@/lib/payments/wxpay", () => ({
  closeWxpayOrder: mocks.closeWxpayOrder,
  createWxpayNativePayment: vi.fn()
}));

import { cancelRechargeOrder } from "@/lib/billing/payment-service";

const pendingAlipayOrder = {
  id: "order_1",
  userId: "teacher_1",
  outTradeNo: "cx_precreate_not_scanned",
  planId: "credits-10",
  planName: "轻量包",
  planCredits: 10,
  planBaseCredits: 10,
  planBonusCredits: 0,
  amountFen: 1_000,
  provider: "ALIPAY",
  status: "PENDING",
  expiresAt: new Date(Date.now() + 10 * 60_000),
  paymentPayload: JSON.stringify({ kind: "QRCODE", qrCode: "https://qr.alipay.com/example" }),
  paidAt: null,
  closedAt: null,
  createdAt: new Date()
};

describe("充值订单取消", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ ...pendingAlipayOrder });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ ...pendingAlipayOrder, status: "CLOSED", paymentPayload: null, closedAt: new Date() });
  });

  it("支付宝预创建二维码尚未形成交易时，交易不存在应视为已不可支付并关闭本地订单", async () => {
    mocks.closeAlipayOrder.mockResolvedValue({
      code: "40004",
      msg: "Business Failed",
      sub_code: "ACQ.TRADE_NOT_EXIST",
      sub_msg: "交易不存在"
    });

    await expect(cancelRechargeOrder("teacher_1", "order_1")).resolves.toMatchObject({ status: "CLOSED" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "order_1", userId: "teacher_1", status: { in: ["CREATED", "PENDING"] } },
      data: { status: "CLOSED", paymentPayload: null, closedAt: expect.any(Date) }
    });
  });

  it("支付宝返回其他关闭失败时，不能错误关闭本地订单", async () => {
    mocks.closeAlipayOrder.mockResolvedValue({
      code: "40004",
      msg: "Business Failed",
      sub_code: "ACQ.TRADE_STATUS_ERROR",
      sub_msg: "交易状态不合法"
    });

    await expect(cancelRechargeOrder("teacher_1", "order_1")).rejects.toThrow("交易状态不合法");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
