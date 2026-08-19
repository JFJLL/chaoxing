import { createDecipheriv, createSign, createVerify, randomBytes } from "crypto";
import { getPaymentConfiguration } from "@/lib/payments/config";

function normalizePem(value: string, label: string) {
  if (value.includes("-----BEGIN")) return value;
  const body = value.replace(/\s+/g, "");
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join("\n") ?? body}\n-----END ${label}-----`;
}

function buildAuthorizationHeader(method: string, pathname: string, body: string) {
  const config = getPaymentConfiguration().wxpay;
  if (!config.configured) throw new Error("微信支付商户信息尚未配置");
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method.toUpperCase()}\n${pathname}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message, "utf8");
  signer.end();
  const signature = signer.sign(normalizePem(config.privateKey, "PRIVATE KEY"), "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.merchantSerialNo}"`;
}

async function wxpayRequest<T>(method: string, pathname: string, body?: Record<string, unknown>) {
  const config = getPaymentConfiguration().wxpay;
  const rawBody = body ? JSON.stringify(body) : "";
  const response = await fetch(new URL(pathname, config.gateway).toString(), {
    method,
    headers: {
      Authorization: buildAuthorizationHeader(method, pathname, rawBody),
      Accept: "application/json",
      ...(rawBody ? { "Content-Type": "application/json" } : {})
    },
    body: rawBody || undefined,
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`微信支付请求失败：${response.status}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createWxpayNativePayment(input: { outTradeNo: string; description: string; amountFen: number }) {
  const config = getPaymentConfiguration().wxpay;
  const result = await wxpayRequest<{ code_url?: string }>("POST", "/v3/pay/transactions/native", {
    appid: config.appId,
    mchid: config.mchId,
    description: input.description,
    out_trade_no: input.outTradeNo,
    notify_url: config.notifyUrl,
    amount: { total: input.amountFen, currency: "CNY" }
  });
  if (!result.code_url) throw new Error("微信支付未返回付款二维码");
  return result.code_url;
}

export async function queryWxpayOrder(outTradeNo: string) {
  const config = getPaymentConfiguration().wxpay;
  return wxpayRequest<Record<string, unknown>>(
    "GET",
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.mchId)}`
  );
}

export async function closeWxpayOrder(outTradeNo: string) {
  const config = getPaymentConfiguration().wxpay;
  return wxpayRequest<Record<string, unknown>>(
    "POST",
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`,
    { mchid: config.mchId }
  );
}

export function verifyAndDecryptWxpayNotification(input: { headers: Headers; rawBody: string }) {
  const config = getPaymentConfiguration().wxpay;
  if (!config.configured) throw new Error("微信支付商户信息尚未配置");
  const timestamp = input.headers.get("wechatpay-timestamp") ?? "";
  const nonce = input.headers.get("wechatpay-nonce") ?? "";
  const signature = input.headers.get("wechatpay-signature") ?? "";
  const serial = input.headers.get("wechatpay-serial") ?? "";
  if (!timestamp || !nonce || !signature || !serial || serial !== config.platformPublicKeyId) {
    throw new Error("微信支付通知签名信息无效");
  }
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${input.rawBody}\n`, "utf8");
  verifier.end();
  if (!verifier.verify(normalizePem(config.platformPublicKey, "PUBLIC KEY"), signature, "base64")) {
    throw new Error("微信支付通知验签失败");
  }

  const envelope = JSON.parse(input.rawBody) as {
    id?: string;
    resource?: { associated_data?: string; nonce?: string; ciphertext?: string };
  };
  const resource = envelope.resource;
  if (!envelope.id || !resource?.nonce || !resource.ciphertext) throw new Error("微信支付通知内容无效");
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  if (encrypted.length < 17) throw new Error("微信支付通知密文无效");
  const cipherText = encrypted.subarray(0, -16);
  const authTag = encrypted.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  const plainText = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
  return { eventId: envelope.id, payload: JSON.parse(plainText) as Record<string, unknown> };
}
