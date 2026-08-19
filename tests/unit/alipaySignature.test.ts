import { createVerify, generateKeyPairSync } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAlipayOrder, createAlipayNativePayment } from "@/lib/payments/alipay";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

function configureAlipay() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.ALIPAY_ENABLED = "true";
  process.env.ALIPAY_APP_ID = "2021006179613284";
  process.env.ALIPAY_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.ALIPAY_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.ALIPAY_NOTIFY_URL = "https://api.red-magic.cn/api/payments/alipay/notify";
  process.env.ALIPAY_RETURN_URL = "https://api.red-magic.cn/space/billing";
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

function requestContent(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key, value]) => key !== "sign" && value !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function expectValidSignature(params: URLSearchParams, publicKey: string) {
  const sign = params.get("sign");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(requestContent(params), "utf8");
  verifier.end();
  expect(verifier.verify(publicKey, sign!, "base64")).toBe(true);
}

describe("支付宝二维码支付 RSA2 签名", () => {
  it("预创建订单使用官方订单码接口，返回二维码并生成可验证签名", async () => {
    const publicKey = configureAlipay();
    let sentParams: URLSearchParams | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sentParams = new URLSearchParams(String(init.body));
      return new Response(JSON.stringify({
        alipay_trade_precreate_response: { code: "10000", msg: "Success", qr_code: "https://qr.alipay.com/example" }
      }), { status: 200 });
    }));

    await expect(createAlipayNativePayment({
      outTradeNo: "cx_signature_regression",
      subject: "Chaoxing 轻量包",
      amountFen: 1_000
    })).resolves.toBe("https://qr.alipay.com/example");

    expect(sentParams).not.toBeNull();
    const params = sentParams!;
    expect(params.get("method")).toBe("alipay.trade.precreate");
    expect(params.get("sign_type")).toBe("RSA2");
    expect(params.get("notify_url")).toBe(process.env.ALIPAY_NOTIFY_URL);
    expect(params.has("return_url")).toBe(false);
    expect(JSON.parse(params.get("biz_content")!)).toMatchObject({ product_code: "QR_CODE_OFFLINE" });
    expectValidSignature(params, publicKey);
  });

  it("关闭订单时不把缺省回调字段序列化为字符串 undefined", async () => {
    const publicKey = configureAlipay();
    let sentParams: URLSearchParams | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sentParams = new URLSearchParams(String(init.body));
      return new Response(JSON.stringify({ alipay_trade_close_response: { code: "10000", msg: "Success" } }), { status: 200 });
    }));

    await closeAlipayOrder("cx_close_signature_regression");

    expect(sentParams).not.toBeNull();
    const params = sentParams!;
    expect(params.get("method")).toBe("alipay.trade.close");
    expect(params.has("notify_url")).toBe(false);
    expect(params.has("return_url")).toBe(false);
    expect(params.toString()).not.toContain("undefined");
    expectValidSignature(params, publicKey);
  });
});
