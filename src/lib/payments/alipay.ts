import { createSign, createVerify } from "crypto";
import { getPaymentConfiguration } from "@/lib/payments/config";

function normalizePem(value: string, label: string) {
  if (value.includes("-----BEGIN")) return value;
  const body = value.replace(/\s+/g, "");
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join("\n") ?? body}\n-----END ${label}-----`;
}

function alipayTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const take = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  return `${take("year")}-${take("month")}-${take("day")} ${take("hour")}:${take("minute")}:${take("second")}`;
}

function canonicalize(params: Record<string, string | undefined>, excluded: ReadonlySet<string>) {
  return Object.entries(params)
    .filter(([key, value]) => !excluded.has(key) && value !== undefined && value !== "")
    // 支付宝要求按参数名 ASCII 升序，不能依赖运行环境的区域化排序规则。
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function requestSignContent(params: Record<string, string | undefined>) {
  // 请求加签只排除 sign 本身；sign_type=RSA2 必须参与待签名串。
  return canonicalize(params, new Set(["sign"]));
}

function notificationVerifyContent(params: Record<string, string | undefined>) {
  // 普通支付异步通知验签应排除 sign 和 sign_type。
  return canonicalize(params, new Set(["sign", "sign_type"]));
}

function sign(params: Record<string, string | undefined>, privateKey: string) {
  const signer = createSign("RSA-SHA256");
  signer.update(requestSignContent(params), "utf8");
  signer.end();
  return signer.sign(normalizePem(privateKey, "PRIVATE KEY"), "base64");
}

function signedParams(input: {
  method: string;
  bizContent: Record<string, unknown>;
  notifyUrl?: string;
  returnUrl?: string;
}) {
  const config = getPaymentConfiguration().alipay;
  if (!config.configured) throw new Error("支付宝商户信息尚未配置");
  const params: Record<string, string | undefined> = {
    app_id: config.appId,
    method: input.method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(),
    version: "1.0",
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    biz_content: JSON.stringify(input.bizContent)
  };
  params.sign = sign(params, config.privateKey);
  return params as Record<string, string>;
}

async function callAlipay(method: string, bizContent: Record<string, unknown>) {
  const config = getPaymentConfiguration().alipay;
  const params = signedParams({ method, bizContent });
  const response = await fetch(config.gateway, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store"
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`支付宝请求失败：${response.status}`);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("支付宝返回数据无效");
  }
}

export function createAlipayPaymentUrl(input: { outTradeNo: string; subject: string; amountFen: number }) {
  const config = getPaymentConfiguration().alipay;
  const params = signedParams({
    method: "alipay.trade.page.pay",
    notifyUrl: config.notifyUrl,
    returnUrl: config.returnUrl || undefined,
    bizContent: {
      out_trade_no: input.outTradeNo,
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: (input.amountFen / 100).toFixed(2),
      subject: input.subject,
      timeout_express: "30m"
    }
  });
  return `${config.gateway}?${new URLSearchParams(params).toString()}`;
}

export function verifyAlipayNotification(params: Record<string, string>) {
  const config = getPaymentConfiguration().alipay;
  if (!config.configured || params.sign_type !== "RSA2" || !params.sign) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(notificationVerifyContent(params), "utf8");
  verifier.end();
  return verifier.verify(normalizePem(config.publicKey, "PUBLIC KEY"), params.sign, "base64");
}

export async function queryAlipayOrder(outTradeNo: string) {
  const payload = await callAlipay("alipay.trade.query", { out_trade_no: outTradeNo });
  return payload.alipay_trade_query_response as Record<string, unknown> | undefined;
}

export async function closeAlipayOrder(outTradeNo: string) {
  const payload = await callAlipay("alipay.trade.close", { out_trade_no: outTradeNo });
  return payload.alipay_trade_close_response as Record<string, unknown> | undefined;
}
