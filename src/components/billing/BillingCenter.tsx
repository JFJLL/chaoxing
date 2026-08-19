"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, CreditCard, Loader2, QrCode, WalletCards, X } from "lucide-react";

type Account = { available: number; reserved: number };
type Plan = { id: string; name: string; baseCredits: number; bonusCredits: number; credits: number; amountFen: number; description: string };
type Provider = "ALIPAY" | "WXPAY";
type Order = {
  id: string; outTradeNo: string; planName: string; planCredits: number; planBaseCredits: number; planBonusCredits: number; amountYuan: string;
  provider: string; status: string; expiresAt: string; paidAt: string | null; createdAt: string;
};
type Access = { kind: "REDIRECT"; paymentUrl: string } | { kind: "QRCODE"; qrCode: string } | null;

function statusText(status: string) {
  return ({ CREATED: "待发起", PENDING: "待支付", PAID: "已到账", EXPIRED: "已过期", CLOSED: "已关闭", FAILED: "支付创建失败" } as Record<string, string>)[status] ?? status;
}

function statusTone(status: string) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "PENDING" || status === "CREATED") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function BillingCenter({ initialAccount, initialOrders }: { initialAccount: Account; initialOrders: Order[] }) {
  const [account, setAccount] = useState(initialAccount);
  const [orders, setOrders] = useState(initialOrders);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState({ alipay: false, wxpay: false });
  const [provider, setProvider] = useState<Provider>("WXPAY");
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState("");
  const [access, setAccess] = useState<Access>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  const enabledProviders = useMemo(() => ({
    ALIPAY: providers.alipay,
    WXPAY: providers.wxpay
  }), [providers]);

  async function refresh() {
    const [accountResponse, ordersResponse] = await Promise.all([
      fetch("/api/billing/account", { cache: "no-store" }),
      fetch("/api/payments/orders", { cache: "no-store" })
    ]);
    if (accountResponse.ok) {
      const body = await accountResponse.json() as { account: Account };
      setAccount(body.account);
    }
    if (ordersResponse.ok) {
      const body = await ordersResponse.json() as { orders: Order[] };
      setOrders(body.orders);
      const matching = activeOrder ? body.orders.find((item) => item.id === activeOrder.id) ?? null : null;
      setActiveOrder(matching);
    }
  }

  useEffect(() => {
    void fetch("/api/billing/recharge-plans", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: { plans?: Plan[]; providers?: { alipay?: boolean; wxpay?: boolean } } | null) => {
        if (!body) return;
        setPlans(body.plans ?? []);
        const nextProviders = { alipay: Boolean(body.providers?.alipay), wxpay: Boolean(body.providers?.wxpay) };
        setProviders(nextProviders);
        if (!nextProviders.wxpay && nextProviders.alipay) setProvider("ALIPAY");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!access || access.kind !== "QRCODE") {
      setQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(access.qrCode, { margin: 1, width: 280, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [access]);

  useEffect(() => {
    if (!activeOrder || !["CREATED", "PENDING"].includes(activeOrder.status)) return;
    const timer = window.setInterval(() => { void refresh(); }, 2_500);
    return () => window.clearInterval(timer);
  }, [activeOrder?.id, activeOrder?.status]);

  useEffect(() => {
    if (activeOrder?.status === "PAID") {
      setAccess(null);
      setPendingPlan(null);
      void refresh();
    }
  }, [activeOrder?.status]);

  async function createOrder() {
    if (!pendingPlan || creating) return;
    if (!enabledProviders[provider]) {
      setError("该支付方式尚未配置，请选择另一支付方式或联系管理员");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ planId: pendingPlan.id, provider })
      });
      const body = await response.json().catch(() => null) as { order?: Order; access?: Access; error?: string } | null;
      if (!response.ok || !body?.order) throw new Error(body?.error ?? "充值订单创建失败");
      setActiveOrder(body.order);
      setAccess(body.access ?? null);
      setOrders((current) => [body.order!, ...current.filter((item) => item.id !== body.order!.id)]);
      if (body.access?.kind === "REDIRECT") window.open(body.access.paymentUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "充值订单创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function cancelOrder(order: Order) {
    if (cancellingOrderId || !["CREATED", "PENDING"].includes(order.status)) return;
    if (!window.confirm(`确认取消“${order.planName}”充值订单？取消后当前付款链接或二维码将失效。`)) return;
    setCancellingOrderId(order.id); setError("");
    try {
      const response = await fetch(`/api/payments/orders/${order.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { order?: Order; error?: string } | null;
      if (!response.ok || !body?.order) throw new Error(body?.error ?? "订单取消失败");
      setOrders((current) => current.map((item) => item.id === body.order!.id ? body.order! : item));
      if (activeOrder?.id === order.id) { setActiveOrder(body.order); setAccess(null); setPendingPlan(null); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单取消失败");
    } finally { setCancellingOrderId(""); }
  }

  const dialogOpen = Boolean(pendingPlan);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-blue-100">教师积分中心</p>
            <div className="mt-2 flex items-end gap-2"><span className="text-5xl font-semibold tracking-tight">{account.available}</span><span className="pb-1 text-blue-100">可用积分</span></div>
            <p className="mt-3 text-sm text-blue-100">生成整页 AI 课件每页消耗 1 积分；单页重新生成同样消耗 1 积分。</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-5 py-4 text-sm backdrop-blur"><p className="text-blue-100">生成中冻结</p><p className="mt-1 text-2xl font-semibold">{account.reserved} 积分</p></div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4"><div><h1 className="text-xl font-semibold text-slate-900">充值套餐</h1><p className="mt-1 text-sm text-slate-500">1 积分 = 1 元人民币；金额越高，赠送积分越多，到账后可立即用于生成课件。</p></div><WalletCards className="h-6 w-6 text-blue-600" aria-hidden="true" /></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">{plan.name}</h2><p className="mt-2 text-3xl font-semibold text-blue-700">{plan.credits}<span className="ml-1 text-sm font-medium text-slate-500">积分</span></p><p className="mt-1 text-sm text-slate-500">¥{(plan.amountFen / 100).toFixed(2)} · 基础 {plan.baseCredits} 积分</p>{plan.bonusCredits > 0 ? <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">额外赠送 +{plan.bonusCredits} 积分</p> : <p className="mt-2 text-xs text-slate-400">无额外赠送</p>}<p className="mt-3 min-h-10 text-sm leading-5 text-slate-500">{plan.description}</p><button type="button" onClick={() => { setPendingPlan(plan); setError(""); setAccess(null); setActiveOrder(null); }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"><CreditCard className="h-4 w-4" aria-hidden="true" />立即充值</button></article>)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">充值订单</h2><p className="mt-1 text-sm text-slate-500">支付成功后由服务端验证并自动到账。</p></div><button type="button" onClick={() => void refresh()} className="text-sm font-medium text-blue-600 hover:text-blue-700">刷新</button></div><div className="mt-4 divide-y divide-slate-100">{orders.length ? orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium text-slate-800">{order.planName} · {order.planCredits} 积分{order.planBonusCredits > 0 ? `（含赠送 ${order.planBonusCredits}）` : ""}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString("zh-CN")} · {order.provider === "WXPAY" ? "微信支付" : "支付宝"}</p></div><div className="flex items-center gap-3"><span className="font-medium text-slate-800">¥{order.amountYuan}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(order.status)}`}>{statusText(order.status)}</span>{["CREATED", "PENDING"].includes(order.status) ? <button type="button" disabled={cancellingOrderId === order.id} onClick={() => void cancelOrder(order)} className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">{cancellingOrderId === order.id ? "取消中" : "取消订单"}</button> : null}</div></div>) : <p className="py-8 text-center text-sm text-slate-500">尚无充值订单</p>}</div></section>

      {dialogOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-900">充值到账 {pendingPlan?.credits} 积分</h2><p className="mt-1 text-sm text-slate-500">实付 ¥{pendingPlan ? (pendingPlan.amountFen / 100).toFixed(2) : "0.00"}{pendingPlan?.bonusCredits ? `，含赠送 ${pendingPlan.bonusCredits} 积分` : ""}</p></div><button type="button" onClick={() => { setPendingPlan(null); setAccess(null); }} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>{!access ? <><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={!providers.wxpay} onClick={() => setProvider("WXPAY")} className={`rounded-xl border p-3 text-sm font-medium ${provider === "WXPAY" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"} disabled:cursor-not-allowed disabled:opacity-40`}>微信支付</button><button type="button" disabled={!providers.alipay} onClick={() => setProvider("ALIPAY")} className={`rounded-xl border p-3 text-sm font-medium ${provider === "ALIPAY" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"} disabled:cursor-not-allowed disabled:opacity-40`}>支付宝</button></div><p className="mt-3 text-xs text-slate-500">支付未配置的渠道不可选；付款结果以服务端到账通知为准。</p><button type="button" disabled={creating || !enabledProviders[provider]} onClick={() => void createOrder()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}{creating ? "正在创建订单" : `使用${provider === "WXPAY" ? "微信" : "支付宝"}付款`}</button></> : <div className="mt-6 text-center">{access.kind === "QRCODE" ? <><p className="mb-3 text-sm font-medium text-slate-700">请使用微信扫码支付</p>{qrDataUrl ? <img src={qrDataUrl} alt="微信支付二维码" className="mx-auto h-64 w-64 rounded-xl border border-slate-200" /> : <QrCode className="mx-auto h-24 w-24 text-slate-300" />}</> : <><p className="text-sm font-medium text-slate-700">已在新窗口打开支付宝付款页面</p><a href={access.paymentUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">重新打开支付宝</a></>}<div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在确认支付结果</div>{activeOrder && ["CREATED", "PENDING"].includes(activeOrder.status) ? <button type="button" disabled={cancellingOrderId === activeOrder.id} onClick={() => void cancelOrder(activeOrder)} className="mt-4 text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-red-600">{cancellingOrderId === activeOrder.id ? "正在取消订单…" : "取消本次付款"}</button> : null}{activeOrder?.status === "PAID" ? <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />积分已到账</p> : null}</div>}{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}</div></div> : null}
    </div>
  );
}
