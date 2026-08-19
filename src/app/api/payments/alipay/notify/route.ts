import { NextRequest, NextResponse } from "next/server";
import { settleRechargeOrder } from "@/lib/billing/payment-service";
import { verifyAlipayNotification } from "@/lib/payments/alipay";
import { getPaymentConfiguration } from "@/lib/payments/config";

function amountToFen(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [yuan, fraction = ""] = value.split(".");
  return Number(yuan) * 100 + Number(`${fraction}00`.slice(0, 2));
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw).entries());
  const config = getPaymentConfiguration().alipay;
  if (!verifyAlipayNotification(params)) return new NextResponse("failure", { status: 400 });
  if (params.trade_status !== "TRADE_SUCCESS" && params.trade_status !== "TRADE_FINISHED") {
    return new NextResponse("success", { status: 200 });
  }
  if (params.app_id !== config.appId || (config.sellerId && params.seller_id !== config.sellerId)) {
    return new NextResponse("failure", { status: 400 });
  }
  const amountFen = amountToFen(params.total_amount);
  if (!params.out_trade_no || !params.trade_no || amountFen === null) return new NextResponse("failure", { status: 400 });

  try {
    await settleRechargeOrder({
      provider: "ALIPAY",
      providerEventId: params.notify_id || params.trade_no,
      providerTradeNo: params.trade_no,
      outTradeNo: params.out_trade_no,
      amountFen,
      payload: params
    });
    return new NextResponse("success", { status: 200 });
  } catch {
    return new NextResponse("failure", { status: 400 });
  }
}
