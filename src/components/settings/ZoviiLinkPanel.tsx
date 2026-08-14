"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import type { ZoviiLinkStatus } from "@/lib/zovii/linkAccount";
import { maskPhone } from "@/lib/zovii/display";
import { PHONE_PATTERN, SMS_CODE_PATTERN } from "@/lib/validation/auth";
import { useSendCodeCountdown } from "@/components/settings/useSendCodeCountdown";

type ApiError = { error?: string; code?: string };

export function ZoviiLinkPanel({ initialStatus }: { initialStatus: ZoviiLinkStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const { countdown, startCountdown } = useSendCodeCountdown();
  const [error, setError] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  async function handleSendCode(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const formData = new FormData(form);
    const phone = String(formData.get("linkPhone") ?? "");
    if (!PHONE_PATTERN.test(phone)) {
      setError("请输入有效的中国大陆手机号");
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/zovii/link/send-code", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ phone })
      });
      const payload = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setError(payload.error ?? "验证码发送失败，请稍后重试");
        return;
      }
      startCountdown(60);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const phone = String(formData.get("linkPhone") ?? "").trim();
    const code = String(formData.get("linkCode") ?? "").trim();
    if (!PHONE_PATTERN.test(phone)) {
      setError("请输入有效的中国大陆手机号");
      return;
    }
    if (!SMS_CODE_PATTERN.test(code)) {
      setError("请输入收到的验证码");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/zovii/link", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ phone, code })
      });
      const payload = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setError(payload.error ?? "关联失败，请稍后重试");
        return;
      }
      form.reset();
      router.refresh();
      setStatus({ linked: true, maskedPhone: maskPhone(phone) });
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function handleUnlink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("unlinkPassword") ?? "");
    if (!password) {
      setError("请输入当前密码");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/zovii/unlink", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setError(payload.error ?? "解绑失败，请稍后重试");
        return;
      }
      setUnlinkOpen(false);
      router.refresh();
      setStatus({ linked: false });
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {status.linked ? (
        <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">已关联 Zovii 账号</p>
            <p className="mt-1 text-sm text-slate-500">
              手机号 {status.maskedPhone ?? "已关联"}
              {status.linkedAt ? `（${new Date(status.linkedAt).toLocaleDateString("zh-CN")} 关联）` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setUnlinkOpen(true);
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            解绑
          </button>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">尚未关联 Zovii 账号</p>
          <p className="mt-1 text-sm text-slate-500">
            关联后可在学校企业页统一管理成员身份与积分。解绑只解除绑定，不会删除 Zovii 账号。
          </p>
        </div>
      )}

      {!status.linked ? (
        <form onSubmit={handleLink} className="space-y-3 rounded-md border border-slate-200 p-4" noValidate>
          <div className="flex gap-2">
            <input
              id="linkPhone"
              name="linkPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="Zovii 注册手机号"
              required
            />
            <button
              type="button"
              onClick={(event) => void handleSendCode(event)}
              disabled={sendingCode || countdown > 0}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {countdown > 0 ? `${countdown} 秒后重发` : sendingCode ? "发送中…" : "获取验证码"}
            </button>
          </div>
          <input
            id="linkCode"
            name="linkCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
            placeholder="Zovii 短信登录验证码"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-yimei-sidebar px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "关联中…" : "验证并关联"}
          </button>
        </form>
      ) : null}

      {unlinkOpen ? (
        <form onSubmit={handleUnlink} className="space-y-3 rounded-md border border-red-200 bg-red-50/50 p-4" noValidate>
          <p className="text-sm text-slate-700">
            解绑不会删除 Zovii 账号。请输入当前登录密码确认身份后解绑。
          </p>
          <input
            id="unlinkPassword"
            name="unlinkPassword"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
            placeholder="当前密码"
            required
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setUnlinkOpen(false)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "解绑中…" : "确认解绑"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
