"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { ZoviiDemoCredential } from "@/lib/zoviiDemoCredentials";

type Props = {
  credential: ZoviiDemoCredential | null;
};

async function writeClipboard(value: string) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back for browsers that expose Clipboard API but deny it in this context.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

export function ZoviiCredentialDialogContent({
  credential,
  copied,
  onCopy
}: {
  credential: ZoviiDemoCredential | null;
  copied: "account" | "password" | "all" | null;
  onCopy: (value: string, target: "account" | "password" | "all") => void;
}) {
  if (!credential) {
    return <p className="text-sm leading-6 text-slate-600">当前账号暂未配置 Zovii 测试账号，请联系管理员后再试。</p>;
  }

  const fields = [
    { label: "账号", value: credential.account, target: "account" as const },
    { label: "密码", value: credential.password, target: "password" as const }
  ];

  return (
    <>
      <p className="text-sm leading-6 text-slate-600">
        Zovii 自动登录正在建设中，请先复制以下账号和密码登录。
      </p>
      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <div key={field.target} className="text-sm font-medium text-slate-700">
            <span>{field.label}</span>
            <span className="mt-1.5 flex gap-2">
              <input
                readOnly
                value={field.value}
                aria-label={`Zovii ${field.label}`}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-normal text-slate-900 outline-none selection:bg-indigo-200"
              />
              <Button
                type="button"
                variant="secondary"
                className="h-10 px-3"
                onClick={() => onCopy(field.value, field.target)}
              >
                {copied === field.target ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied === field.target ? "已复制" : "复制"}
              </Button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function ZoviiCanvasLauncher({ credential }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"account" | "password" | "all" | null>(null);
  const [message, setMessage] = useState("");

  async function copy(value: string, target: "account" | "password" | "all") {
    try {
      await writeClipboard(value);
      setCopied(target);
      setMessage(target === "all" ? "账号和密码已复制" : `${target === "account" ? "账号" : "密码"}已复制`);
    } catch {
      setCopied(null);
      setMessage("复制失败，请手动选择上方内容复制");
    }
  }

  function close() {
    setOpen(false);
    setCopied(null);
    setMessage("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="cx-focus-ring cx-tactile flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-normal text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:h-11 lg:w-full lg:gap-3"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>Zovii 智能画布</span>
      </button>

      <Dialog open={open} title="登录 Zovii 智能画布" onClose={close}>
        <ZoviiCredentialDialogContent credential={credential} copied={copied} onCopy={copy} />
        <p aria-live="polite" className="mt-3 min-h-5 text-xs text-slate-500">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={close}>取消</Button>
          {credential ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => copy(`账号：${credential.account}\n密码：${credential.password}`, "all")}
            >
              {copied === "all" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied === "all" ? "已复制全部" : "复制账号和密码"}
            </Button>
          ) : null}
          <a
            href="https://zovii.studio/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="cx-focus-ring cx-tactile inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--cx-blue)] px-4 text-sm font-medium text-white shadow-sm hover:bg-[var(--cx-blue-dark)] hover:shadow-md"
          >
            前往 Zovii 登录
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </Dialog>
    </>
  );
}
