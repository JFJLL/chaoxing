"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { MappedCourseOutline } from "@/lib/imports/mapImportedOutlineToCourse";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Input";

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

const REFERENCED_CODES = new Set(["COURSE_OUTLINE_ITEM_REFERENCED", "COURSE_OUTLINE_VERSION_CONFLICT"]);

export function OutlineReviewEditor({
  jobId,
  courseId,
  initialOutline,
  initialOutlineVersion,
  initialBatchVersion,
  hasExistingDirectory = false,
  ambiguousTitles = []
}: {
  jobId: string;
  courseId: string;
  initialOutline: MappedCourseOutline;
  initialOutlineVersion: number;
  initialBatchVersion: number;
  hasExistingDirectory?: boolean;
  ambiguousTitles?: string[];
}) {
  const router = useRouter();
  const [outline, setOutline] = useState(initialOutline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function saveDirectory() {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    const response = await fetch(`/api/ai-import/${jobId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outline,
        expectedOutlineVersion: initialOutlineVersion,
        expectedBatchVersion: initialBatchVersion
      })
    });
    setSubmitting(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      setError({ text: body?.error ?? "保存失败，请检查目录内容。", code: body?.code });
      return;
    }
    router.push(`/space/courses/${courseId}/builder?saved=1`);
  }

  function requestSave() {
    // A brand-new empty course applies directly; only an existing directory needs
    // an explicit confirmation because the save may delete unreferenced items.
    if (hasExistingDirectory) setConfirmOpen(true);
    else void saveDirectory();
  }

  const referencedError = error?.code ? REFERENCED_CODES.has(error.code) : false;

  return (
    <div id="outline-review" className="scroll-mt-6 space-y-5">
      <section className="rounded-md border border-[var(--cx-border)] p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">课程信息</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">课程名称</span><Input value={outline.title} onChange={(event) => setOutline({ ...outline, title: event.target.value })} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">适用对象</span><Input value={outline.targetAudience} onChange={(event) => setOutline({ ...outline, targetAudience: event.target.value })} /></label>
        </div>
        <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-slate-700">课程简介</span><Textarea className="w-full" value={outline.description} onChange={(event) => setOutline({ ...outline, description: event.target.value })} /></label>
        <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-slate-700">学习目标（每行一项）</span><Textarea className="w-full" value={outline.learningObjectives.join("\n")} onChange={(event) => setOutline({ ...outline, learningObjectives: lines(event.target.value) })} /></label>
      </section>

      {ambiguousTitles.length ? (
        <p role="status" className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          以下标题在现有目录中重复，无法自动匹配，将作为新增项保存；如需合并请到课程目录维护页确认：{ambiguousTitles.join("、")}
        </p>
      ) : null}

      {outline.chapters.map((chapter, chapterIndex) => (
        <section key={chapter.id ?? `${chapter.order}-${chapterIndex}`} className="rounded-md border border-[var(--cx-border)] bg-slate-50 p-4">
          <div className="flex gap-2">
            <label className="flex-1 space-y-1 text-sm"><span className="font-medium text-slate-700">章节名称</span><Input value={chapter.title} onChange={(event) => setOutline({ ...outline, chapters: outline.chapters.map((item, index) => index === chapterIndex ? { ...item, title: event.target.value } : item) })} /></label>
            <Button type="button" variant="ghost" className="mt-6 h-10 w-10 px-0" onClick={() => setOutline({ ...outline, chapters: outline.chapters.filter((_, index) => index !== chapterIndex) })} aria-label="删除章节"><Trash2 className="h-4 w-4" /></Button>
          </div>
          <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-slate-700">章节简介</span><Textarea className="w-full" value={chapter.summary} onChange={(event) => setOutline({ ...outline, chapters: outline.chapters.map((item, index) => index === chapterIndex ? { ...item, summary: event.target.value } : item) })} /></label>
          <div className="mt-4 space-y-3">
            {chapter.lessons.map((lesson, lessonIndex) => {
              const patchLesson = (patch: Partial<typeof lesson>) => setOutline({
                ...outline,
                chapters: outline.chapters.map((item, index) => index === chapterIndex ? {
                  ...item,
                  lessons: item.lessons.map((lessonItem, currentIndex) => currentIndex === lessonIndex ? { ...lessonItem, ...patch } : lessonItem)
                } : item)
              });
              return (
                <div key={lesson.id ?? `${lesson.order}-${lessonIndex}`} className="rounded-md bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                    <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">课时名称</span><Input value={lesson.title} onChange={(event) => patchLesson({ title: event.target.value })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">时长（分钟）</span><Input type="number" min={1} value={lesson.estimatedMinutes} onChange={(event) => patchLesson({ estimatedMinutes: Number(event.target.value) || 1 })} /></label>
                    <Button type="button" variant="ghost" className="mt-6 h-10 w-10 px-0" onClick={() => setOutline({ ...outline, chapters: outline.chapters.map((item, index) => index === chapterIndex ? { ...item, lessons: item.lessons.filter((_, currentIndex) => currentIndex !== lessonIndex) } : item) })} aria-label="删除课时"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-slate-700">课时简介</span><Textarea className="w-full" value={lesson.summary} onChange={(event) => patchLesson({ summary: event.target.value })} /></label>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">知识点（每行一项）</span><Textarea className="w-full" value={lesson.keyPoints.join("\n")} onChange={(event) => patchLesson({ keyPoints: lines(event.target.value) })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">活动（每行一项）</span><Textarea className="w-full" value={lesson.suggestedActivities.join("\n")} onChange={(event) => patchLesson({ suggestedActivities: lines(event.target.value) })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">评价（每行一项）</span><Textarea className="w-full" value={lesson.assessmentPrompts.join("\n")} onChange={(event) => patchLesson({ assessmentPrompts: lines(event.target.value) })} /></label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {error ? (
        <div role="alert" className="space-y-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error.text}</p>
          {referencedError ? (
            <Link href={`/space/courses/${courseId}/builder`} className="inline-flex font-medium text-red-700 underline underline-offset-4">
              前往课程目录维护
            </Link>
          ) : null}
        </div>
      ) : null}
      <Button type="button" onClick={requestSave} disabled={submitting}>{submitting ? "保存中" : "保存课程目录"}</Button>

      <Dialog open={confirmOpen} title="确认保存课程目录" onClose={() => setConfirmOpen(false)}>
        <div className="space-y-4 text-sm text-slate-700">
          <p>本次保存将更新当前课程目录：</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>同名章节和课时保留原有 ID</li>
            <li>新章节和课时将新增</li>
            <li>本次未保留且没有引用的旧内容将删除</li>
            <li>已被资料或学习记录引用的内容不会被删除</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button type="button" onClick={() => void saveDirectory()} disabled={submitting}>确认保存</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
