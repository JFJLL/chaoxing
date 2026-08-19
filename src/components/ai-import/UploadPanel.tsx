"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getUploadButtonLabel } from "@/lib/imports/importProgress";
import { createSubmissionLock, uploadCourseDocuments } from "@/lib/imports/importUpload";

export function UploadPanel({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submissionLock = useRef(createSubmissionLock());

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || !submissionLock.current.acquire()) return;
    setSubmitting(true);
    setError("");
    let uploaded = false;

    try {
      const result = await uploadCourseDocuments({ courseId, files });
      router.push(`/space/courses/${courseId}/ai-import/${result.jobIds[0]}#outline-review`);
      uploaded = true;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败，请重试");
    } finally {
      if (!uploaded) {
        submissionLock.current.release();
        setSubmitting(false);
      }
    }
  }

  return (
    <form data-teacher-onboarding="import-course-document" onSubmit={onSubmit} className="rounded-md border border-[var(--cx-border)] bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#FDF3F0] text-[var(--cx-blue)]">
          <FileUp className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">从本地上传</h2>
          <p className="mt-1 text-sm text-slate-500">支持 DOCX、PDF、PPTX、TXT、Markdown</p>
          <p className="text-sm text-slate-500">文件会先保存到课程云盘的“课程文档”，再进入解析队列。</p>
          <label
            className={`mt-5 flex min-h-28 flex-col items-center justify-center rounded-md border border-dashed border-[var(--cx-border)] bg-slate-50 p-5 text-center ${
              submitting ? "pointer-events-none cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-100"
            }`}
          >
            <input className="sr-only" type="file" multiple accept=".docx,.pdf,.pptx,.txt,.md" onChange={onFileChange} disabled={submitting} />
            <span className="text-sm font-medium text-slate-700">{files.length ? `已选择 ${files.length} 份文档` : "选择一份或多份文档"}</span>
            {files.length ? <span className="mt-1 text-xs text-slate-500">{files.map((file) => file.name).join("、")}</span> : null}
          </label>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="mt-5" disabled={!files.length || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {getUploadButtonLabel(submitting)}
          </Button>
        </div>
      </div>
    </form>
  );
}
