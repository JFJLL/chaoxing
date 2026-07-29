"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { GeneratedCourseOutline } from "@/types/course";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function OutlineReviewEditor({
  jobId,
  courseId,
  initialOutline,
  initialOutlineVersion
}: {
  jobId: string;
  courseId: string;
  initialOutline: GeneratedCourseOutline;
  initialOutlineVersion: number;
}) {
  const router = useRouter();
  const [outline, setOutline] = useState(initialOutline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function saveDirectory() {
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/ai-import/${jobId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline, expectedOutlineVersion: initialOutlineVersion })
    });
    setSubmitting(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "保存失败，请检查目录内容。");
      return;
    }
    router.push(`/space/courses/${courseId}/builder`);
  }

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

      {outline.chapters.map((chapter, chapterIndex) => (
        <section key={`${chapter.order}-${chapterIndex}`} className="rounded-md border border-[var(--cx-border)] bg-slate-50 p-4">
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
                <div key={`${lesson.order}-${lessonIndex}`} className="rounded-md bg-white p-4">
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

      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <Button type="button" onClick={saveDirectory} disabled={submitting}>{submitting ? "保存中" : "保存课程目录"}</Button>
    </div>
  );
}
