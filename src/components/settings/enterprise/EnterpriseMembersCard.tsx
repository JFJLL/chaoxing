"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type EnterpriseMember = {
  id: string;
  username: string | null;
  displayId: string | null;
  role: string | null;
  enterpriseBalance: number | null;
  consumption: number | null;
  callCount: number | null;
  joinedAt: string | null;
};

type MemberListItem = {
  chaoxingUserId: string;
  name: string;
  email: string;
  phone: string | null;
  linked: boolean;
  externalUserId: string | null;
  enterpriseMember: EnterpriseMember | null;
};

type MemberListPage = {
  items: MemberListItem[];
  total: number;
  page: number;
  limit: number;
};

type Overview = {
  configured: boolean;
  enterpriseId: string | null;
  poolBalance: number | null;
  memberCount: number | null;
};

type OperationRecord = {
  id: string;
  kind: string;
  status: string;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  ENTERPRISE_INVITE: "邀请成员",
  ENTERPRISE_ROLE: "修改角色",
  ENTERPRISE_CREDITS: "积分操作"
};

const STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: "成功",
  FAILED: "失败",
  PENDING: "处理中"
};

const ROLE_LABELS: Record<string, string> = {
  member: "企业成员",
  enterprise_admin: "企业管理员"
};

export function EnterpriseMembersCard({ institutionId }: { institutionId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [pageData, setPageData] = useState<MemberListPage | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<MemberListItem | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<MemberListItem | null>(null);
  const [roleValue, setRoleValue] = useState<"member" | "enterprise_admin">("member");
  const [creditsTarget, setCreditsTarget] = useState<MemberListItem | null>(null);
  const [creditsAction, setCreditsAction] = useState<"allocate" | "adjust">("allocate");
  const [creditsAmount, setCreditsAmount] = useState("");
  const [creditsNote, setCreditsNote] = useState("");
  const [creditsConfirm, setCreditsConfirm] = useState(false);
  const creditsOperationIdRef = useRef<string | null>(null);
  const inviteOperationIdRef = useRef<string | null>(null);
  const roleOperationIdRef = useRef<string | null>(null);

  const load = useCallback(async (nextPage: number, nextSearch: string) => {
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: "20",
        ...(nextSearch ? { search: nextSearch } : {})
      });
      const [overviewResponse, membersResponse] = await Promise.all([
        fetch("/api/enterprise/overview", { cache: "no-store" }),
        fetch(`/api/enterprise/members?${query.toString()}`, { cache: "no-store" })
      ]);
      const overviewPayload = (await overviewResponse.json()) as Overview;
      const membersPayload = (await membersResponse.json()) as MemberListPage;
      setOverview(overviewPayload);
      if (membersResponse.ok) {
        setPageData(membersPayload);
        setPage(membersPayload.page);
      } else {
        setError((membersPayload as { error?: string }).error ?? "加载成员失败");
      }
      const operationsResponse = await fetch("/api/enterprise/operations?limit=10", { cache: "no-store" });
      if (operationsResponse.ok) {
        const operationsPayload = (await operationsResponse.json()) as { items: OperationRecord[] };
        setOperations(operationsPayload.items);
      }
    } catch {
      setError("网络异常，请稍后重试");
    }
  }, []);

  useEffect(() => {
    void load(1, "");
  }, [load, institutionId]);

  function handleSearch(value: string) {
    setSearch(value);
    void load(1, value);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteTarget) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const role = String(formData.get("inviteRole") ?? "member") as "member" | "enterprise_admin";
    const operationId = inviteOperationIdRef.current ?? crypto.randomUUID();
    inviteOperationIdRef.current = operationId;
    setPending(true);
    setError(null);
    setInviteUrl(null);
    try {
      const response = await fetch("/api/enterprise/members/invite", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ targetUserId: inviteTarget.chaoxingUserId, role, operationId })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        inviteUrl?: string | null;
        replayed?: boolean;
      };
      if (!response.ok) {
        setError(payload.error ?? "邀请失败，请稍后重试");
        return;
      }
      inviteOperationIdRef.current = null;
      if (payload.inviteUrl) {
        setInviteUrl(payload.inviteUrl);
      } else {
        setInviteTarget(null);
        await load(page, search);
      }
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function handleRoleChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleTarget?.enterpriseMember) return;
    const operationId = roleOperationIdRef.current ?? crypto.randomUUID();
    roleOperationIdRef.current = operationId;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/enterprise/members/${roleTarget.enterpriseMember.id}/role`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ role: roleValue, confirm: true, operationId })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "角色修改失败，请稍后重试");
        return;
      }
      roleOperationIdRef.current = null;
      setRoleTarget(null);
      await load(page, search);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function handleCreditsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creditsTarget?.enterpriseMember) return;
    const amount = Number(creditsAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("请输入有效的积分数量");
      return;
    }
    if (creditsAction === "adjust" && !creditsConfirm) {
      setError("请勾选确认后再扣减积分");
      return;
    }
    const operationId = creditsOperationIdRef.current ?? crypto.randomUUID();
    creditsOperationIdRef.current = operationId;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/enterprise/members/${creditsTarget.enterpriseMember.id}/credits`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            action: creditsAction,
            amount,
            description: creditsNote.trim() || undefined,
            confirm: creditsAction === "adjust" ? creditsConfirm : true,
            operationId
          })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "积分操作失败，请稍后重试");
        return;
      }
      creditsOperationIdRef.current = null;
      setCreditsTarget(null);
      setCreditsAmount("");
      setCreditsNote("");
      setCreditsConfirm(false);
      await load(page, search);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  const items = pageData?.items ?? [];

  return (
    <section className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          {error.includes("重新关联") ? (
            <a href="/settings" className="ml-2 font-medium underline">
              去账号设置重新关联
            </a>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">企业积分池余额</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {overview?.poolBalance !== null && overview?.poolBalance !== undefined
              ? Number(overview.poolBalance).toFixed(1)
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">企业成员数</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{overview?.memberCount ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">关联企业 ID</p>
          <p className="mt-1 truncate font-mono text-sm text-slate-900">{overview?.enterpriseId ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-base font-medium text-slate-900">最近操作</h2>
        </div>
        {operations.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">暂无操作记录</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {operations.map((operation) => {
              const amount =
                typeof operation.result?.amount === "number" ? Number(operation.result.amount).toFixed(1) : null;
              const detail =
                operation.kind === "ENTERPRISE_CREDITS" && amount
                  ? `${operation.result?.action === "allocate" ? "增加" : "减少"} ${amount} 积分${
                      operation.result?.reconciled ? "（重试时已核对余额）" : ""
                    }`
                  : operation.kind === "ENTERPRISE_ROLE"
                    ? `角色：${operation.result?.role ?? "—"}`
                    : operation.kind === "ENTERPRISE_INVITE"
                      ? operation.result?.inviteUrl
                        ? "已生成邀请链接"
                        : "邀请"
                      : "";
              return (
                <li key={operation.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">
                      {KIND_LABELS[operation.kind] ?? operation.kind}
                      {detail ? <span className="ml-2 text-slate-500">{detail}</span> : null}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(operation.createdAt).toLocaleString("zh-CN")}
                      {operation.errorCode ? ` · ${operation.errorCode}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      operation.status === "SUCCEEDED"
                        ? "bg-green-50 text-green-700"
                        : operation.status === "FAILED"
                          ? "bg-red-50 text-red-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {STATUS_LABELS[operation.status] ?? operation.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h2 className="text-base font-medium text-slate-900">企业成员</h2>
          <input
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="搜索姓名 / 邮箱 / 手机号"
            className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">学生</th>
                <th className="px-4 py-3 font-medium">Zovii 关联</th>
                <th className="px-4 py-3 font-medium">企业角色</th>
                <th className="px-4 py-3 text-right font-medium">企业积分</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    {search ? "未找到匹配的学生" : "暂无学生"}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.chaoxingUserId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {item.linked ? (
                        <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          已关联
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          未关联
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.enterpriseMember ? (
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {ROLE_LABELS[item.enterpriseMember.role ?? ""] ?? item.enterpriseMember.role ?? "成员"}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {item.linked ? "未加入企业" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800">
                      {item.enterpriseMember?.enterpriseBalance !== null &&
                      item.enterpriseMember?.enterpriseBalance !== undefined
                        ? Number(item.enterpriseMember.enterpriseBalance).toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.enterpriseMember ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setRoleTarget(item);
                              roleOperationIdRef.current = null;
                              setRoleValue(
                                item.enterpriseMember?.role === "enterprise_admin" ? "enterprise_admin" : "member"
                              );
                            }}
                            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100"
                          >
                            修改角色
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setCreditsTarget(item);
                              setCreditsAction("allocate");
                              setCreditsAmount("");
                              setCreditsNote("");
                              setCreditsConfirm(false);
                              creditsOperationIdRef.current = null;
                            }}
                            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100"
                          >
                            积分操作
                          </button>
                        </div>
                      ) : item.linked ? (
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setInviteUrl(null);
                            setInviteTarget(item);
                            inviteOperationIdRef.current = null;
                          }}
                          className="rounded-md bg-yimei-sidebar px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                        >
                          邀请加入企业
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pageData && pageData.total > pageData.limit ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>
              共 {pageData.total} 人，第 {page} 页
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => void load(page - 1, search)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page * pageData.limit >= pageData.total}
                onClick={() => void load(page + 1, search)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {inviteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleInvite} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-medium text-slate-900">邀请 {inviteTarget.name} 加入企业</h3>
            <p className="text-sm text-slate-500">
              将生成 Zovii 企业邀请链接，对方登录 Zovii 并同意后加入企业。重复点击不会重复邀请。
            </p>
            <div className="space-y-1">
              <label htmlFor="inviteRole" className="text-sm font-medium text-slate-700">
                企业角色
              </label>
              <select
                id="inviteRole"
                name="inviteRole"
                defaultValue="member"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
              >
                <option value="member">企业成员</option>
                <option value="enterprise_admin">企业管理员</option>
              </select>
            </div>
            {inviteUrl ? (
              <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-800">邀请链接已生成</p>
                <code className="block break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-green-900">
                  {inviteUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(inviteUrl)}
                  className="text-xs font-medium text-green-700 underline"
                >
                  复制链接
                </button>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteTarget(null)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600"
              >
                关闭
              </button>
              {!inviteUrl ? (
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-yimei-sidebar px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "邀请中…" : "生成邀请链接"}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      {roleTarget?.enterpriseMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleRoleChange} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-medium text-slate-900">修改 {roleTarget.name} 的企业角色</h3>
            <p className="text-sm text-slate-500">
              当前角色：{ROLE_LABELS[roleTarget.enterpriseMember.role ?? ""] ?? roleTarget.enterpriseMember.role}
              。调整前请确认，操作会同步到 Zovii 企业。
            </p>
            <div className="space-y-1">
              <label htmlFor="roleValue" className="text-sm font-medium text-slate-700">
                新角色
              </label>
              <select
                id="roleValue"
                value={roleValue}
                onChange={(event) => setRoleValue(event.target.value as "member" | "enterprise_admin")}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
              >
                <option value="member">企业成员</option>
                <option value="enterprise_admin">企业管理员</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoleTarget(null)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-yimei-sidebar px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? "保存中…" : "确认修改"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {creditsTarget?.enterpriseMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleCreditsSubmit} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-medium text-slate-900">
              积分操作 — {creditsTarget.name}
            </h3>
            <p className="text-sm text-slate-500">
              当前企业积分 {creditsTarget.enterpriseMember.enterpriseBalance ?? "—"}；积分池余额{" "}
              {overview?.poolBalance !== null && overview?.poolBalance !== undefined
                ? Number(overview.poolBalance).toFixed(1)
                : "—"}
              。操作为增量增减，重复提交不会重复执行。
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">操作类型</label>
              <div className="flex gap-2">
                {(["allocate", "adjust"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      setCreditsAction(action);
                      setCreditsConfirm(false);
                    }}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                      creditsAction === action
                        ? "border-yimei-sidebar bg-blue-50 text-yimei-sidebar"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {action === "allocate" ? "增加" : "减少"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="creditsAmount" className="text-sm font-medium text-slate-700">
                积分数量
              </label>
              <input
                id="creditsAmount"
                type="number"
                min="0.1"
                step="0.1"
                value={creditsAmount}
                onChange={(event) => setCreditsAmount(event.target.value)}
                placeholder="例如 100"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="creditsNote" className="text-sm font-medium text-slate-700">
                备注（可选）
              </label>
              <input
                id="creditsNote"
                value={creditsNote}
                onChange={(event) => setCreditsNote(event.target.value)}
                maxLength={200}
                placeholder="操作说明"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {creditsAction === "adjust" ? (
              <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={creditsConfirm}
                  onChange={(event) => setCreditsConfirm(event.target.checked)}
                  className="mt-0.5"
                />
                我已确认将扣减该成员 {creditsAmount || "—"} 积分
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreditsTarget(null)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={pending}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  creditsAction === "adjust" ? "bg-red-600 hover:bg-red-700" : "bg-yimei-sidebar hover:bg-blue-700"
                }`}
              >
                {pending ? "提交中…" : creditsAction === "adjust" ? "确认扣减" : "确认增加"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
