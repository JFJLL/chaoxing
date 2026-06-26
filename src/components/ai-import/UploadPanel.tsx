"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function UploadPanel({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError("");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(`/api/courses/${courseId}/ai-import`, {
      method: "POST",
      body: formData
    });
    setSubmitting(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "上传失败");
      return;
    }
    const body = (await response.json()) as { jobId: string };
    router.push(`/space/courses/${courseId}/ai-import/${body.jobId}`);
  }

  return (
    <form onSubmit={onSubmit} className="rounded-md border border-[var(--cx-border)] bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-[var(--cx-blue)]">
          <FileUp className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">上传课程文档</h2>
          <p className="mt-1 text-sm text-slate-500">支持 DOCX、PDF、TXT、Markdown</p>
          <p className="text-sm text-slate-500">提交后进入解析队列，生成结果确认后才写入课程</p>
          <label className="mt-5 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[var(--cx-border)] bg-slate-50 p-5 text-center hover:bg-slate-100">
            <input className="sr-only" type="file" accept=".docx,.pdf,.txt,.md" onChange={onFileChange} disabled={submitting} />
            <span className="text-sm font-medium text-slate-700">{file ? file.name : "选择文档"}</span>
            {file ? <span className="mt-1 text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</span> : null}
          </label>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="mt-5" disabled={!file || submitting}>
            {submitting ? "提交任务中" : "提交解析任务"}
          </Button>
        </div>
      </div>
    </form>
  );
}
