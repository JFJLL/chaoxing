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

  async function upload(file: File) {
    setBusy(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(`/api/courses/${courseId}/resources`, { method: "POST", body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "课程资料上传失败");
      setStatus("资料已发布，学生可查看/下载，AI 也可引用");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "课程资料上传失败");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  }

  if (!folderConfigured) return <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">上传课程资料前，请先设置课程云盘根文件夹。</p>;
  return (
    <article className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
        <UploadCloud className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-slate-900">上传课程资料</h3>
        <p className="mt-1 text-sm text-slate-500">选择文件后会直接上传到当前课程资料库。</p>
        {status ? <p role="status" className="mt-1 text-sm text-slate-600">{status}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label="选择课程资料文件"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        {busy ? "正在上传" : "选择并上传"}
      </Button>
    </article>
  );
}
