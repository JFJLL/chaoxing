"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import type { FormEvent } from "react";
import type { SessionUser } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export function UserMenu({ user }: { user: SessionUser }) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { accept: "application/json" }
    });
    window.location.assign("/login");
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);

    try {
      const formData = new FormData(form);
      const currentPassword = String(formData.get("currentPassword") ?? "");
      const newPassword = String(formData.get("newPassword") ?? "");
      const confirmPassword = String(formData.get("confirmPassword") ?? "");

      if (currentPassword.length < 6) {
        setError("请输入当前密码");
        return;
      }
      if (newPassword.length < 6) {
        setError("新密码至少 6 位");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("两次输入的新密码不一致");
        return;
      }
      if (newPassword === currentPassword) {
        setError("新密码不能与当前密码相同");
        return;
      }

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "修改失败，请稍后重试");
        return;
      }

      form.reset();
      setPasswordDialogOpen(false);
      setToast("密码修改成功，下次登录请使用新密码。");
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="cx-focus-ring cx-tactile flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-100"
        aria-haspopup="menu"
        aria-label={`${user.name}，打开用户菜单`}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cx-blue)] text-sm font-semibold text-white shadow-sm">
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 md:block">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      <div className="invisible absolute right-0 top-12 z-40 w-48 translate-y-1 rounded-xl border border-[var(--cx-border)] bg-white py-2 opacity-0 shadow-floating transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPending(false);
            setPasswordDialogOpen(true);
          }}
          aria-haspopup="dialog"
          className="cx-focus-ring flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        >
          <KeyRound className="h-4 w-4" />
          修改密码
        </button>
        <form action="/api/auth/logout" method="post" onSubmit={handleLogout}>
          <button type="submit" className="cx-focus-ring flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" />
            退出空间
          </button>
        </form>
      </div>

      <Dialog
        open={passwordDialogOpen}
        title="修改密码"
        overlayClassName="bg-transparent backdrop-blur-none"
        onClose={() => setPasswordDialogOpen(false)}
      >
        <form onSubmit={handleChangePassword} noValidate className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="currentPassword" className="text-sm font-medium text-slate-700">
              当前密码
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="请输入当前密码"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium text-slate-700">
              新密码
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="至少 6 位"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
              确认新密码
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="再次输入新密码"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setPasswordDialogOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "提交中…" : "确认修改"}
            </Button>
          </div>
        </form>
      </Dialog>

      {toast
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center">
              <p
                role="status"
                className="cx-toast-in rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 shadow-lg"
              >
                {toast}
              </p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
