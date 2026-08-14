"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { PHONE_PATTERN, SMS_CODE_PATTERN } from "@/lib/validation/auth";
import { useSendCodeCountdown } from "@/components/settings/useSendCodeCountdown";

type ApiError = { error?: string; code?: string };

export default function RegisterPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const { countdown, startCountdown } = useSendCodeCountdown();
  const [error, setError] = useState<string | null>(null);
  const [linkHint, setLinkHint] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  async function handleSendCode(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const formData = new FormData(form);
    const phone = String(formData.get("phone") ?? "");
    if (!PHONE_PATTERN.test(phone)) {
      setError("请输入有效的中国大陆手机号");
      return;
    }
    setSendingCode(true);
    setError(null);
    setLinkHint(false);
    setRecoveryMode(false);
    try {
      const response = await fetch("/api/auth/register/send-code", {
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

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const phone = String(formData.get("phone") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!PHONE_PATTERN.test(phone)) {
      setError("请输入有效的中国大陆手机号");
      return;
    }
    if (!SMS_CODE_PATTERN.test(code)) {
      setError("请输入收到的验证码");
      return;
    }
    if (name.length < 2) {
      setError("姓名至少 2 个字符");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("请输入有效邮箱");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setPending(true);
    setError(null);
    setLinkHint(false);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ phone, code, name, email, password, confirmPassword })
      });
      const payload = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setError(payload.error ?? "注册失败，请稍后重试");
        if (payload.code === "PHONE_EXISTS_ON_ZOVII") {
          setLinkHint(true);
        } else if (payload.code === "RECOVERY_CODE_SENT") {
          setRecoveryMode(true);
          startCountdown(60);
        }
        return;
      }
      router.push("/space");
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-panel">
        <img src="/logo.png" alt="平台 Logo" className="h-12 w-auto object-contain" />
        <p className="mt-6 text-sm text-slate-500">新用户注册</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">注册账号</h1>
        <p className="mt-2 text-sm text-slate-500">
          使用手机号验证码注册，将同时创建本平台与关联学习平台的账号。
        </p>
        <form onSubmit={handleRegister} className="mt-6 space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-slate-700">
              手机号
            </label>
            <div className="flex gap-2">
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={11}
                onChange={() => {
                  setRecoveryMode(false);
                  setLinkHint(false);
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
                placeholder="请输入手机号"
                required
              />
              <button
                type="button"
                onClick={(event) => void handleSendCode(event)}
                disabled={sendingCode || countdown > 0 || recoveryMode}
                className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recoveryMode
                  ? "登录验证码已发送"
                  : countdown > 0
                    ? `${countdown} 秒后重发`
                    : sendingCode
                      ? "发送中…"
                      : "获取验证码"}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium text-slate-700">
              验证码
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="请输入短信验证码"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-slate-700">
              姓名
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={30}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="请输入姓名"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="name@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="至少 6 位"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
              确认密码
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="再次输入密码"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {linkHint ? (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              该手机号已有 Zovii 账号。可更换其他手机号注册；若你已有本平台账号，登录后可在“账号设置 → 关联
              Zovii”中完成关联。
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-yimei-sidebar px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "注册中…" : "注册并进入空间"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          已有账号？{" "}
          <Link href="/login" className="font-medium text-yimei-sidebar hover:underline">
            直接登录
          </Link>
        </p>
      </section>
    </main>
  );
}
