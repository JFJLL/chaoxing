"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type AdminRecord = {
  id: string;
  userId: string;
  name: string;
  email: string;
  grantedAt: string;
};

type ConfigState = {
  configured: boolean;
  enterpriseId: string | null;
  admins?: AdminRecord[];
};

export function EnterpriseConfigCard({
  institutionId,
  initialEnterpriseId
}: {
  institutionId: string;
  initialEnterpriseId: string;
}) {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [enterpriseId, setEnterpriseId] = useState(initialEnterpriseId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; email: string }>>([]);

  useEffect(() => {
    void fetch("/api/institution/integration", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        setConfig(payload as ConfigState);
        if (typeof payload.enterpriseId === "string") setEnterpriseId(payload.enterpriseId);
      })
      .catch(() => setError("加载配置失败，请刷新重试"));
  }, [institutionId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/integration", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ enterpriseId: enterpriseId.trim() })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "保存失败，请稍后重试");
        return;
      }
      const reload = (await fetch("/api/institution/integration", { cache: "no-store" }).then((r) =>
        r.json()
      )) as ConfigState;
      setConfig(reload);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function searchCandidates(value: string) {
    setGrantEmail(value);
    if (!value.trim()) {
      setCandidates([]);
      return;
    }
    try {
      const response = await fetch(`/api/institution/users?search=${encodeURIComponent(value.trim())}`, {
        cache: "no-store"
      });
      if (response.ok) {
        const payload = (await response.json()) as { users: Array<{ id: string; name: string; email: string }> };
        setCandidates(payload.users);
      }
    } catch {
      setCandidates([]);
    }
  }

  async function handleGrant(userId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/integration", {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ userId })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "授权失败，请稍后重试");
        return;
      }
      setGrantEmail("");
      setCandidates([]);
      const reload = (await fetch("/api/institution/integration", { cache: "no-store" }).then((r) =>
        r.json()
      )) as ConfigState;
      setConfig(reload);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function handleRevoke(userId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/institution/integration/admins/${userId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "撤销失败，请稍后重试");
        return;
      }
      const reload = (await fetch("/api/institution/integration", { cache: "no-store" }).then((r) =>
        r.json()
      )) as ConfigState;
      setConfig(reload);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-base font-medium text-slate-900">企业关联配置</h2>
      <p className="mt-1 text-sm text-slate-500">
        一个学校对应一个 Zovii 企业 ID；配置变更会写入审计记录。
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSave} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <label htmlFor="enterpriseId" className="text-sm font-medium text-slate-700">
            Zovii 企业 ID
          </label>
          <input
            id="enterpriseId"
            value={enterpriseId}
            onChange={(event) => setEnterpriseId(event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
            placeholder="enterprise-xxx"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-yimei-sidebar px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "保存中…" : "保存配置"}
        </button>
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-800">集成管理员</h3>
        <p className="mt-1 text-sm text-slate-500">
          只有被授权的集成管理员可以邀请成员、修改企业角色和调整积分；教师角色不会自动获得权限。
        </p>
        <ul className="mt-3 space-y-2">
          {(config?.admins ?? []).map((admin) => (
            <li key={admin.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{admin.name}</p>
                <p className="text-xs text-slate-500">{admin.email}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleRevoke(admin.userId)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              >
                撤销
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={grantEmail}
            onChange={(event) => void searchCandidates(event.target.value)}
            placeholder="按姓名或邮箱搜索本校用户"
            className="min-w-64 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
          />
          {candidates.length > 0 ? (
            <ul className="w-full rounded-md border border-slate-200 bg-white shadow-sm">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => void handleGrant(candidate.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{candidate.name}</span>
                    <span className="text-xs text-slate-500">{candidate.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
