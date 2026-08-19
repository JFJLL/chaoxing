import { NextRequest, NextResponse } from "next/server";
import { settleRechargeOrder } from "@/lib/billing/payment-service";
import { getPaymentConfiguration } from "@/lib/payments/config";
import { verifyAndDecryptWxpayNotification } from "@/lib/payments/wxpay";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  try {
    const { eventId, payload } = verifyAndDecryptWxpayNotification({ headers: request.headers, rawBody });
    const config = getPaymentConfiguration().wxpay;
    const outTradeNo = typeof payload.out_trade_no === "string" ? payload.out_trade_no : "";
    const transactionId = typeof payload.transaction_id === "string" ? payload.transaction_id : "";
    const tradeState = typeof payload.trade_state === "string" ? payload.trade_state : "";
    const amount = payload.amount && typeof payload.amount === "object" ? payload.amount as { total?: unknown } : null;
    const amountFen = typeof amount?.total === "number" ? amount.total : null;
    if (
      tradeState !== "SUCCESS"
      || payload.appid !== config.appId
      || payload.mchid !== config.mchId
      || !outTradeNo
      || !transactionId
      || amountFen === null
    ) {
      return NextResponse.json({ code: "FAIL", message: "invalid payment notification" }, { status: 400 });
    }
    await settleRechargeOrder({
      provider: "WXPAY",
      providerEventId: eventId,
      providerTradeNo: transactionId,
      outTradeNo,
      amountFen,
      payload
    });
    return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
  } catch {
    return NextResponse.json({ code: "FAIL", message: "通知处理失败" }, { status: 400 });
  }
}
