"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import type { CourseDirectoryNode, CourseLessonNode } from "@/types/course";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function emptyLesson(order: number): CourseLessonNode {
  return {
    id: newId("lesson"),
    title: "新课时",
    summary: "",
    order,
    estimatedMinutes: 30,
    keyPoints: [],
    suggestedActivities: [],
    assessmentPrompts: []
  };
}

function reorderChapters(chapters: CourseDirectoryNode[]) {
  return chapters.map((chapter, index) => ({
    ...chapter,
    order: index + 1,
    lessons: chapter.lessons.map((lesson, lessonIndex) => ({ ...lesson, order: lessonIndex + 1 }))
  }));
}

type ChapterTreeProps = {
  courseId: string;
  initialChapters: CourseDirectoryNode[];
  initialOutlineVersion: number;
};

export function ChapterTree({ courseId, initialChapters, initialOutlineVersion }: ChapterTreeProps) {
  const [chapters, setChapters] = useState<CourseDirectoryNode[]>(initialChapters);
  const [outlineVersion, setOutlineVersion] = useState(initialOutlineVersion);
  const [editing, setEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<CourseDirectoryNode[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function startEditing() {
    // Keep an immutable snapshot so “取消” can restore exactly what was on screen
    // before editing began, without issuing any save request.
    setEditSnapshot(structuredClone(chapters));
    setMessage("");
    setEditing(true);
  }

  function cancelEditing() {
    if (editSnapshot) setChapters(editSnapshot);
    setEditSnapshot(null);
    setMessage("");
    setEditing(false);
  }

  function updateChapter(chapterIndex: number, patch: Partial<CourseDirectoryNode>) {
    setChapters((current) => current.map((chapter, index) => (index === chapterIndex ? { ...chapter, ...patch } : chapter)));
  }

  function updateLesson(chapterIndex: number, lessonIndex: number, patch: Partial<CourseLessonNode>) {
    setChapters((current) =>
      current.map((chapter, index) =>
        index === chapterIndex
          ? {
              ...chapter,
              lessons: chapter.lessons.map((lesson, currentLessonIndex) =>
                currentLessonIndex === lessonIndex ? { ...lesson, ...patch } : lesson
              )
            }
          : chapter
      )
    );
  }

  function addChapter() {
    setChapters((current) =>
      reorderChapters([
        ...current,
        {
          id: newId("chapter"),
          title: "新章节",
          summary: "",
          order: current.length + 1,
          lessons: [emptyLesson(1)]
        }
      ])
    );
  }

  function addLesson(chapterIndex: number) {
    setChapters((current) =>
      reorderChapters(
        current.map((chapter, index) =>
          index === chapterIndex
            ? {
                ...chapter,
                lessons: [...chapter.lessons, emptyLesson(chapter.lessons.length + 1)]
              }
            : chapter
        )
      )
    );
  }

  function removeChapter(chapterIndex: number) {
    setChapters((current) => reorderChapters(current.filter((_, index) => index !== chapterIndex)));
  }

  function removeLesson(chapterIndex: number, lessonIndex: number) {
    setChapters((current) =>
      reorderChapters(
        current.map((chapter, index) =>
          index === chapterIndex
            ? {
                ...chapter,
                lessons: chapter.lessons.filter((_, currentLessonIndex) => currentLessonIndex !== lessonIndex)
              }
            : chapter
        )
      )
    );
  }

  function moveChapter(chapterIndex: number, direction: -1 | 1) {
    const nextIndex = chapterIndex + direction;
    if (nextIndex < 0 || nextIndex >= chapters.length) return;
    const next = [...chapters];
    [next[chapterIndex], next[nextIndex]] = [next[nextIndex], next[chapterIndex]];
    setChapters(reorderChapters(next));
  }

  function moveLesson(chapterIndex: number, lessonIndex: number, direction: -1 | 1) {
    const chapter = chapters[chapterIndex];
    const nextIndex = lessonIndex + direction;
    if (!chapter || nextIndex < 0 || nextIndex >= chapter.lessons.length) return;
    const lessons = [...chapter.lessons];
    [lessons[lessonIndex], lessons[nextIndex]] = [lessons[nextIndex], lessons[lessonIndex]];
    setChapters((current) =>
      reorderChapters(current.map((item, index) => (index === chapterIndex ? { ...item, lessons } : item)))
    );
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/courses/${courseId}/outline`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapters: reorderChapters(chapters), expectedOutlineVersion: outlineVersion })
    });
    setSaving(false);
    const body = (await response.json().catch(() => null)) as { error?: string; outlineVersion?: number; chapters?: CourseDirectoryNode[] } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "保存失败");
      return;
    }
    if (typeof body?.outlineVersion === "number") setOutlineVersion(body.outlineVersion);
    if (Array.isArray(body?.chapters)) setChapters(body.chapters);
    setEditSnapshot(null);
    setEditing(false);
    setMessage("已保存修改");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">课程目录</h2>
          <p className="text-sm text-slate-500">目录默认只读；编辑保存时会校验版本，避免覆盖其他教师的修改。</p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={cancelEditing} disabled={saving}><X className="h-4 w-4" />取消</Button>
            <Button type="button" variant="secondary" onClick={addChapter}><Plus className="h-4 w-4" />新增章节</Button>
            <Button type="button" onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? "保存中" : "保存修改"}</Button>
          </div>
        ) : <Button type="button" onClick={startEditing}>编辑</Button>}
      </div>
      {message ? <p className="text-sm text-slate-500">{message}</p> : null}
      <div className="space-y-4">
        {chapters.map((chapter, chapterIndex) => (
          <section key={chapter.id} className="rounded-md border border-[var(--cx-border)] bg-slate-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="grid flex-1 gap-3 md:grid-cols-[1fr_2fr]">
                <Input disabled={!editing} value={chapter.title} onChange={(event) => updateChapter(chapterIndex, { title: event.target.value })} />
                <Input disabled={!editing} value={chapter.summary} onChange={(event) => updateChapter(chapterIndex, { summary: event.target.value })} placeholder="章节简介" />
              </div>
              {editing ? <div className="flex gap-1">
                <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => moveChapter(chapterIndex, -1)} aria-label="章节上移">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => moveChapter(chapterIndex, 1)} aria-label="章节下移">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => removeChapter(chapterIndex)} aria-label="删除章节">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div> : null}
            </div>
            <div className="mt-4 space-y-3">
              {chapter.lessons.map((lesson, lessonIndex) => (
                <div key={lesson.id} className="rounded-md border border-white bg-white p-3">
                  <div className="grid gap-3 lg:grid-cols-[1fr_2fr_110px_auto]">
                    <Input disabled={!editing} value={lesson.title} onChange={(event) => updateLesson(chapterIndex, lessonIndex, { title: event.target.value })} />
                    <Input disabled={!editing} value={lesson.summary} onChange={(event) => updateLesson(chapterIndex, lessonIndex, { summary: event.target.value })} placeholder="课时简介" />
                    <Input
                      disabled={!editing}
                      type="number"
                      min={1}
                      value={lesson.estimatedMinutes}
                      onChange={(event) => updateLesson(chapterIndex, lessonIndex, { estimatedMinutes: Number(event.target.value) || 30 })}
                      aria-label="预计分钟"
                    />
                    {editing ? <div className="flex gap-1">
                      <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => moveLesson(chapterIndex, lessonIndex, -1)} aria-label="课时上移">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => moveLesson(chapterIndex, lessonIndex, 1)} aria-label="课时下移">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" className="h-9 w-9 px-0" onClick={() => removeLesson(chapterIndex, lessonIndex)} aria-label="删除课时">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div> : null}
                  </div>
                  <Textarea
                    disabled={!editing}
                    className="mt-3 w-full"
                    value={lesson.keyPoints.join("\n")}
                    onChange={(event) =>
                      updateLesson(chapterIndex, lessonIndex, {
                        keyPoints: event.target.value.split(/\r?\n/).filter(Boolean)
                      })
                    }
                    placeholder="关键点，每行一个"
                  />
                </div>
              ))}
              {editing ? <Button type="button" variant="secondary" className="h-9" onClick={() => addLesson(chapterIndex)}>
                <Plus className="h-4 w-4" />
                新增课时
              </Button> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
