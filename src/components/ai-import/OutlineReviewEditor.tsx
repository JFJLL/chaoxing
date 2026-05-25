"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { GeneratedCourseOutline } from "@/types/course";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function OutlineReviewEditor({
  jobId,
  courseId,
  initialOutline
}: {
  jobId: string;
  courseId: string;
  initialOutline: GeneratedCourseOutline;
}) {
  const router = useRouter();
  const [outline, setOutline] = useState(initialOutline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function apply() {
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/ai-import/${jobId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline })
    });
    setSubmitting(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "应用失败，请检查目录内容。");
      return;
    }
    router.push(`/space/courses/${courseId}/builder`);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-[var(--cx-border)] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={outline.title} onChange={(event) => setOutline({ ...outline, title: event.target.value })} />
          <Input value={outline.targetAudience} onChange={(event) => setOutline({ ...outline, targetAudience: event.target.value })} />
        </div>
        <Textarea className="mt-3 w-full" value={outline.description} onChange={(event) => setOutline({ ...outline, description: event.target.value })} />
        <Textarea
          className="mt-3 w-full"
          value={outline.learningObjectives.join("\n")}
          onChange={(event) =>
            setOutline({
              ...outline,
              learningObjectives: event.target.value.split(/\r?\n/).filter(Boolean)
            })
          }
          placeholder="学习目标，每行一个"
        />
      </section>

      {outline.chapters.map((chapter, chapterIndex) => (
        <section key={`${chapter.order}-${chapterIndex}`} className="rounded-md border border-[var(--cx-border)] bg-slate-50 p-4">
          <div className="flex gap-2">
            <Input
              value={chapter.title}
              onChange={(event) =>
                setOutline({
                  ...outline,
                  chapters: outline.chapters.map((item, index) => (index === chapterIndex ? { ...item, title: event.target.value } : item))
                })
              }
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 px-0"
              onClick={() => setOutline({ ...outline, chapters: outline.chapters.filter((_, index) => index !== chapterIndex) })}
              aria-label="删除章节"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {chapter.lessons.map((lesson, lessonIndex) => (
              <div key={`${lesson.order}-${lessonIndex}`} className="flex gap-2 rounded-md bg-white p-3">
                <Input
                  value={lesson.title}
                  onChange={(event) =>
                    setOutline({
                      ...outline,
                      chapters: outline.chapters.map((item, index) =>
                        index === chapterIndex
                          ? {
                              ...item,
                              lessons: item.lessons.map((lessonItem, currentLessonIndex) =>
                                currentLessonIndex === lessonIndex ? { ...lessonItem, title: event.target.value } : lessonItem
                              )
                            }
                          : item
                      )
                    })
                  }
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-10 px-0"
                  onClick={() =>
                    setOutline({
                      ...outline,
                      chapters: outline.chapters.map((item, index) =>
                        index === chapterIndex ? { ...item, lessons: item.lessons.filter((_, currentLessonIndex) => currentLessonIndex !== lessonIndex) } : item
                      )
                    })
                  }
                  aria-label="删除课时"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="button" onClick={apply} disabled={submitting}>
        {submitting ? "应用中" : "应用到课程"}
      </Button>
    </div>
  );
}
