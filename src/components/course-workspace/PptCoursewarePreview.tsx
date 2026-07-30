"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import type { AiCoursewarePayload } from "@/types/courseWorkspace";

/**
 * Read-only 16:9 preview for a generated PPT courseware artifact. It renders the
 * persisted slides of the currently selected artifact — never the latest source
 * courseware, another version, or client placeholder data. Editing PPT content
 * is done by revising the source AI courseware and regenerating a new PPT.
 */
export function PptCoursewarePreview({
  title,
  version,
  slides,
  sourceLabel
}: {
  title: string;
  version: number;
  slides: AiCoursewarePayload["slides"];
  sourceLabel?: string;
}) {
  const [current, setCurrent] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);

  // Clamp the active page whenever the artifact (and thus slide count) changes.
  useEffect(() => {
    setCurrent(0);
    setNotesOpen(false);
  }, [title, version, slides.length]);

  if (!slides.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
        当前 PPT 课件还没有可预览的页面内容。请回到 AI 课件确认后重新生成 PPT。
      </div>
    );
  }

  const index = Math.min(current, slides.length - 1);
  const slide = slides[index]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-700">PPT课件 · v{version}</span>
        {sourceLabel ? <span>来源：{sourceLabel}</span> : null}
        <span>共{slides.length}页</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
        <ol aria-label="PPT 页面缩略图" className="flex gap-2 overflow-x-auto lg:max-h-[520px] lg:flex-col lg:overflow-y-auto">
          {slides.map((thumb, thumbIndex) => (
            <li key={`${thumb.title}-${thumbIndex}`} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => setCurrent(thumbIndex)}
                aria-current={thumbIndex === index ? "true" : undefined}
                className={`flex aspect-video w-40 flex-col overflow-hidden rounded-lg border p-2 text-left transition lg:w-full ${thumbIndex === index ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <span className="text-[10px] font-medium text-slate-400">第 {thumbIndex + 1} 页</span>
                <span className="mt-1 line-clamp-2 text-xs font-medium text-slate-700">{thumb.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex h-full flex-col p-6 lg:p-8">
              <h3 className="line-clamp-2 shrink-0 text-xl font-semibold text-slate-900 lg:text-2xl">{slide.title}</h3>
              <ul className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {slide.bullets.map((bullet, bulletIndex) => (
                  <li key={`${bullet}-${bulletIndex}`} className="flex gap-2 text-sm text-slate-700 lg:text-base">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span className="min-w-0 break-words">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrent((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />上一页
            </button>
            <span className="text-sm text-slate-500">第 {index + 1} / {slides.length} 页</span>
            <button
              type="button"
              onClick={() => setCurrent((value) => Math.min(slides.length - 1, value + 1))}
              disabled={index === slides.length - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40"
            >
              下一页<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setNotesOpen((value) => !value)}
              aria-expanded={notesOpen}
              aria-controls="ppt-speaker-notes"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700"
            >
              查看教师讲稿备注
              {notesOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            </button>
            {notesOpen ? <p id="ppt-speaker-notes" className="whitespace-pre-wrap border-t border-slate-100 px-3 py-2 text-sm text-slate-600">{slide.speakerNotes}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
