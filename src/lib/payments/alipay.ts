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
  // 传输参数必须与待签名参数完全一致。URLSearchParams 会把 undefined 序列化为字符串
  // "undefined"；若签名时省略、发送时保留，网关将无法通过验签。
  const requestParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") requestParams[key] = value;
  }
  return requestParams;
}

async function callAlipay(input: {
  method: string;
  bizContent: Record<string, unknown>;
  notifyUrl?: string;
  returnUrl?: string;
}) {
  const config = getPaymentConfiguration().alipay;
  const params = signedParams(input);
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

export async function createAlipayNativePayment(input: { outTradeNo: string; subject: string; amountFen: number }) {
  const config = getPaymentConfiguration().alipay;
  const payload = await callAlipay({
    method: "alipay.trade.precreate",
    notifyUrl: config.notifyUrl,
    bizContent: {
      out_trade_no: input.outTradeNo,
      product_code: "QR_CODE_OFFLINE",
      total_amount: (input.amountFen / 100).toFixed(2),
      subject: input.subject,
      timeout_express: "30m",
      ...(config.sellerId ? { seller_id: config.sellerId } : {})
    }
  });
  const response = payload.alipay_trade_precreate_response as Record<string, unknown> | undefined;
  if (String(response?.code ?? "") !== "10000" || typeof response?.qr_code !== "string" || !response.qr_code) {
    throw new Error(String(response?.sub_msg ?? response?.msg ?? "支付宝未返回有效付款二维码"));
  }
  return response.qr_code;
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
  const payload = await callAlipay({ method: "alipay.trade.query", bizContent: { out_trade_no: outTradeNo } });
  return payload.alipay_trade_query_response as Record<string, unknown> | undefined;
}

export async function closeAlipayOrder(outTradeNo: string) {
  const payload = await callAlipay({ method: "alipay.trade.close", bizContent: { out_trade_no: outTradeNo } });
  return payload.alipay_trade_close_response as Record<string, unknown> | undefined;
}
