"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function CourseResourceUpload({ courseId, folderConfigured }: { courseId: string; folderConfigured: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function upload(formData: FormData) {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`/api/courses/${courseId}/copilot/files`, { method: "POST", body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "课程资料上传失败");
      setStatus("资料已上传到课程云盘文件夹");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "课程资料上传失败");
    } finally {
      setBusy(false);
    }
  }

  if (!folderConfigured) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">上传课程资料前，请先在“上课 → Copilot 设置”中绑定云盘文件夹。</p>;
  return <form action={upload} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4"><input ref={inputRef} name="file" type="file" required className="min-w-0 flex-1 text-sm" /><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}上传课程资料</Button>{status ? <span role="status" className="text-sm text-slate-600">{status}</span> : null}</form>;
}
