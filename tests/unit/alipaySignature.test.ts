import { createVerify, generateKeyPairSync } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAlipayPaymentUrl } from "@/lib/payments/alipay";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function requestContent(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key, value]) => key !== "sign" && value !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

describe("支付宝网页支付 RSA2 签名", () => {
  it("将 sign_type 纳入请求待签名串，且生成的 sign 可由对应应用公钥验证", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.ALIPAY_ENABLED = "true";
    process.env.ALIPAY_APP_ID = "2021006179613284";
    process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
    process.env.ALIPAY_NOTIFY_URL = "https://api.red-magic.cn/api/payments/alipay/notify";
    process.env.ALIPAY_RETURN_URL = "https://api.red-magic.cn/space/billing";

    const paymentUrl = createAlipayPaymentUrl({
      outTradeNo: "cx_signature_regression",
      subject: "Chaoxing 轻量包",
      amountFen: 1_000
    });
    const params = new URL(paymentUrl).searchParams;
    const sign = params.get("sign");
    const content = requestContent(params);

    expect(content).toContain("sign_type=RSA2");
    expect(content).toContain("charset=utf-8");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(content, "utf8");
    verifier.end();
    expect(verifier.verify(process.env.ALIPAY_PUBLIC_KEY!, sign!, "base64")).toBe(true);
  });
});
