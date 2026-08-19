"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { TokenUsagePanel } from "@/components/admin/TokenUsagePanel";

type UserItem = {
  id: string; name: string; email: string; role: string;
  institution: { name: string };
  creditAccount: { available: number; reserved: number; updatedAt: string } | null;
  _count: { ownedCourses: number; enrollments: number };
};
type CourseItem = {
  id: string; title: string; status: string; updatedAt: string;
  owner: { id: string; name: string; email: string };
  institution: { name: string };
  _count: { enrollments: number; aiArtifacts: number };
};
type TokenUsage = { calls: number; providerUsageCalls: number; promptTokensActual: number; completionTokensActual: number; totalTokensActual: number };
type Overview = {
  summary: { users: number; teachers: number; courses: number; availableCredits: number; totalTokensActual: number; providerUsageCalls: number; totalAiCalls: number };
  users: UserItem[]; courses: CourseItem[];
  recentOrders: Array<{ id: string; outTradeNo: string; planName: string; planCredits: number; amountFen: number; provider: string; status: string; user: { name: string; email: string }; createdAt: string; paidAt: string | null }>;
  teacherTokenUsage: Array<TokenUsage & { userId: string; teacherName: string; teacherEmail: string }>;
  courseTokenUsage: Array<TokenUsage & { courseId: string; courseTitle: string; ownerName: string; ownerEmail: string }>;
};

function roleText(role: string) {
  return role === "ADMIN" ? "管理员" : role === "TEACHER" ? "教师" : "学生";
}
function statusText(status: string) {
  return ({ PENDING: "待付款", PAID: "已支付", CLOSED: "已取消", EXPIRED: "已过期" } as Record<string, string>)[status] ?? status;
}

export function AdminCenter() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [adjustments, setAdjustments] = useState<Record<string, { delta: string; reason: string }>>({});

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const body = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "管理员数据加载失败");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "管理员数据加载失败");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return data?.users ?? [];
    return (data?.users ?? []).filter((item) => [item.name, item.email, item.institution.name, roleText(item.role)].join(" ").toLowerCase().includes(keyword));
  }, [data, query]);

  async function submitAdjustment(user: UserItem) {
    const adjustment = adjustments[user.id] ?? { delta: "", reason: "" };
    const delta = Number(adjustment.delta);
    if (!Number.isInteger(delta) || delta === 0 || !adjustment.reason.trim()) {
      setError("请填写非零整数和调账原因。"); return;
    }
    if (!window.confirm(`确认对“${user.name}”${delta > 0 ? "增加" : "扣减"} ${Math.abs(delta)} 积分？该操作会写入不可变账本。`)) return;
    setBusyUserId(user.id); setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/credits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delta, reason: adjustment.reason }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "积分调账失败");
      setAdjustments((current) => ({ ...current, [user.id]: { delta: "", reason: "" } }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "积分调账失败");
    } finally { setBusyUserId(""); }
  }

  if (loading && !data) return <div className="flex min-h-72 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在加载管理数据</div>;
  if (!data) return <div className="rounded-2xl bg-red-50 p-5 text-red-700">{error || "管理员数据不可用"}</div>;

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-[#F9ECE7] bg-gradient-to-r from-[#FDF3F0] to-white p-6 lg:flex-row lg:items-center">
      <div><div className="flex items-center gap-2 text-sm font-medium text-[#8E3425]"><ShieldCheck className="h-4 w-4" />最高权限控制台</div><h1 className="mt-2 text-2xl font-semibold text-slate-900">平台运营管理</h1><p className="mt-2 text-sm leading-6 text-slate-600">管理员可查看全量课程、用户、充值订单和模型供应商实际返回的 AI Token，并通过审计账本调整用户可用积分。</p></div>
      <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />刷新数据</button>
    </header>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[["用户", data.summary.users], ["教师", data.summary.teachers], ["课程", data.summary.courses], ["可用积分总额", data.summary.availableCredits], ["实际 Token 总量", new Intl.NumberFormat("zh-CN").format(data.summary.totalTokensActual)], ["Usage 已回传 / AI 调用", `${data.summary.providerUsageCalls} / ${data.summary.totalAiCalls}`]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p></article>)}
    </section>
    <TokenUsagePanel teachers={data.teacherTokenUsage} courses={data.courseTokenUsage} />
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold text-slate-900">用户与积分</h2><p className="mt-1 text-sm text-slate-500">扣减仅作用于可用积分，不会动用冻结中的课件生成预算。</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、邮箱、机构或角色" className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#D07865]" /></div><div className="mt-5 overflow-x-auto"><table className="min-w-[1040px] w-full text-left text-sm"><thead className="border-b border-slate-100 text-slate-500"><tr><th className="px-3 py-3 font-medium">用户</th><th className="px-3 py-3 font-medium">角色</th><th className="px-3 py-3 font-medium">可用 / 冻结</th><th className="px-3 py-3 font-medium">课程</th><th className="px-3 py-3 font-medium">积分调账</th></tr></thead><tbody>{filteredUsers.map((user) => { const adjustment = adjustments[user.id] ?? { delta: "", reason: "" }; return <tr key={user.id} className="border-b border-slate-50 align-top"><td className="px-3 py-4"><p className="font-medium text-slate-800">{user.name}</p><p className="mt-1 text-xs text-slate-500">{user.email} · {user.institution.name}</p></td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${user.role === "ADMIN" ? "bg-[#F9ECE7] text-[#8E3425]" : "bg-slate-100 text-slate-600"}`}>{roleText(user.role)}</span></td><td className="px-3 py-4 font-medium text-slate-800">{user.creditAccount?.available ?? 0} / <span className="text-slate-400">{user.creditAccount?.reserved ?? 0}</span></td><td className="px-3 py-4 text-slate-600">主讲 {user._count.ownedCourses} · 选课 {user._count.enrollments}</td><td className="px-3 py-3"><div className="flex min-w-[370px] gap-2"><input value={adjustment.delta} onChange={(event) => setAdjustments((current) => ({ ...current, [user.id]: { ...adjustment, delta: event.target.value } }))} placeholder="例如 +10 或 -5" className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-[#D07865]" /><input value={adjustment.reason} onChange={(event) => setAdjustments((current) => ({ ...current, [user.id]: { ...adjustment, reason: event.target.value } }))} placeholder="调账原因（必填）" className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-[#D07865]" /><button type="button" disabled={busyUserId === user.id || user.role === "ADMIN"} onClick={() => void submitAdjustment(user)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#A8402F] px-3 text-xs font-medium text-white disabled:opacity-40">{busyUserId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Number(adjustment.delta) < 0 ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}提交</button></div></td></tr>; })}</tbody></table></div></section>
    <section className="grid gap-6 xl:grid-cols-2"><article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">所有课程</h2><div className="mt-4 max-h-[440px] overflow-y-auto"><table className="w-full text-left text-sm"><tbody>{data.courses.map((course) => <tr key={course.id} className="border-b border-slate-50"><td className="py-3 pr-3"><Link className="font-medium text-[#8E3425] hover:underline" href={`/space/courses/${course.id}`}>{course.title}</Link><p className="mt-1 text-xs text-slate-500">{course.institution.name} · {course.owner.name}（{course.owner.email}）</p></td><td className="py-3 text-right text-xs text-slate-500">{course._count.enrollments} 名学生<br />{course._count.aiArtifacts} 个 AI 产物</td></tr>)}</tbody></table></div></article><article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">最近充值订单</h2><div className="mt-4 max-h-[440px] overflow-y-auto"><table className="w-full text-left text-sm"><tbody>{data.recentOrders.map((order) => <tr key={order.id} className="border-b border-slate-50"><td className="py-3"><p className="font-medium text-slate-800">{order.user.name} · {order.planName}</p><p className="mt-1 text-xs text-slate-500">{order.provider === "ALIPAY" ? "支付宝" : "微信支付"} · {order.outTradeNo}</p></td><td className="py-3 text-right"><p className="font-medium text-slate-800">¥{(order.amountFen / 100).toFixed(2)} / {order.planCredits} 积分</p><p className="mt-1 text-xs text-slate-500">{statusText(order.status)}</p></td></tr>)}</tbody></table></div></article></section>
  </div>;
}
