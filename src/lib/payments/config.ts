export type PaymentProvider = "ALIPAY" | "WXPAY";

export type RechargePlan = {
  id: string;
  name: string;
  /** 实付金额按 1 积分 = 1 元换算得到的基础积分。 */
  baseCredits: number;
  /** 随套餐金额增加发放的额外赠送积分。 */
  bonusCredits: number;
  /** 最终到账积分，等于基础积分与赠送积分之和。 */
  credits: number;
  amountFen: number;
  description: string;
};

// 1 积分 = 1 元；大额套餐额外赠送积分，赠送部分与实付积分会在订单和账本中分别留痕。
export const RECHARGE_PLANS: readonly RechargePlan[] = [
  { id: "credits-10", name: "轻量包", baseCredits: 10, bonusCredits: 0, credits: 10, amountFen: 1_000, description: "实付 10 元，到账 10 积分" },
  { id: "credits-30", name: "备课包", baseCredits: 30, bonusCredits: 3, credits: 33, amountFen: 3_000, description: "实付 30 元，赠送 3 积分，合计到账 33 积分" },
  { id: "credits-100", name: "学期包", baseCredits: 100, bonusCredits: 15, credits: 115, amountFen: 10_000, description: "实付 100 元，赠送 15 积分，合计到账 115 积分" },
  { id: "credits-300", name: "学年包", baseCredits: 300, bonusCredits: 60, credits: 360, amountFen: 30_000, description: "实付 300 元，赠送 60 积分，合计到账 360 积分" }
] as const;

function required(value: string | undefined) {
  return Boolean(value && value.trim());
}

export function getRechargePlan(planId: string) {
  return RECHARGE_PLANS.find((plan) => plan.id === planId) ?? null;
}

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return value === "ALIPAY" || value === "WXPAY";
}

export function getPaymentConfiguration() {
  const alipay = {
    enabled: process.env.ALIPAY_ENABLED === "true",
    appId: process.env.ALIPAY_APP_ID?.trim() ?? "",
    privateKey: process.env.ALIPAY_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "",
    publicKey: process.env.ALIPAY_PUBLIC_KEY?.replace(/\\n/g, "\n").trim() ?? "",
    sellerId: process.env.ALIPAY_SELLER_ID?.trim() ?? "",
    gateway: process.env.ALIPAY_GATEWAY?.trim() || "https://openapi.alipay.com/gateway.do",
    notifyUrl: process.env.ALIPAY_NOTIFY_URL?.trim() ?? "",
    returnUrl: process.env.ALIPAY_RETURN_URL?.trim() ?? ""
  };
  const wxpay = {
    enabled: process.env.WXPAY_ENABLED === "true",
    appId: process.env.WXPAY_APP_ID?.trim() ?? "",
    mchId: process.env.WXPAY_MCH_ID?.trim() ?? "",
    merchantSerialNo: process.env.WXPAY_MERCHANT_SERIAL_NO?.trim() ?? "",
    privateKey: process.env.WXPAY_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "",
    apiV3Key: process.env.WXPAY_API_V3_KEY?.trim() ?? "",
    platformPublicKey: process.env.WXPAY_PLATFORM_PUBLIC_KEY?.replace(/\\n/g, "\n").trim() ?? "",
    platformPublicKeyId: process.env.WXPAY_PLATFORM_PUBLIC_KEY_ID?.trim() ?? "",
    gateway: process.env.WXPAY_GATEWAY?.trim() || "https://api.mch.weixin.qq.com",
    notifyUrl: process.env.WXPAY_NOTIFY_URL?.trim() ?? ""
  };

  return {
    alipay: {
      ...alipay,
      configured: alipay.enabled && required(alipay.appId) && required(alipay.privateKey) && required(alipay.publicKey) && required(alipay.notifyUrl)
    },
    wxpay: {
      ...wxpay,
      configured: wxpay.enabled
        && required(wxpay.appId)
        && required(wxpay.mchId)
        && required(wxpay.merchantSerialNo)
        && required(wxpay.privateKey)
        && wxpay.apiV3Key.length === 32
        && required(wxpay.platformPublicKey)
        && required(wxpay.platformPublicKeyId)
        && required(wxpay.notifyUrl)
    }
  };
}

export function publicRechargePlans() {
  const config = getPaymentConfiguration();
  return {
    plans: RECHARGE_PLANS,
    providers: {
      alipay: config.alipay.configured,
      wxpay: config.wxpay.configured
    }
  };
}
