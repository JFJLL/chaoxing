"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import type { AiCoursewarePayload } from "@/types/courseWorkspace";

// Template brand accent (crimson) reused from courseware-template.pptx so the
// web preview reads as the same designed deck rather than a plain bullet list.
const BRAND = "#c8102e";

/**
 * Read-only preview for a generated PPT courseware artifact. Native .pptx cannot
 * render in the browser, so instead of converting the file we redraw each slide
 * in HTML using the template's visual language (brand accent header, numbered
 * pages, styled bullets). It renders only the persisted slides of the selected
 * artifact — never the latest source courseware or client placeholder data.
 * Editing PPT content is done by revising the source AI courseware.
 */
export function PptCoursewarePreview({
  title,
  version,
  slides,
  sourceLabel,
  onRegenerateSlide
}: {
  title: string;
  version: number;
  slides: AiCoursewarePayload["slides"];
  sourceLabel?: string;
  onRegenerateSlide?: (pageNo: number) => Promise<void>;
}) {
  const [current, setCurrent] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");

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

  async function regenerateCurrentSlide() {
    if (!onRegenerateSlide || regenerating) return;
    if (!window.confirm(`重新生成第 ${index + 1} 页将消耗 1 积分，确定继续吗？`)) return;
    setRegenerating(true);
    setRegenerateError("");
    try {
      await onRegenerateSlide(index + 1);
    } catch (error) {
      setRegenerateError(error instanceof Error ? error.message : "重新生成请求失败");
    } finally {
      setRegenerating(false);
    }
  }

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
                className={`relative flex aspect-video w-40 flex-col overflow-hidden rounded-lg border p-2 text-left transition lg:w-full ${thumbIndex === index ? "border-[color:var(--ppt-brand)] bg-rose-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                style={{ ["--ppt-brand" as string]: BRAND }}
              >
                {thumb.imagePath ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb.imagePath} alt={`第 ${thumbIndex + 1} 页：${thumb.title}`} className="absolute inset-0 h-full w-full object-cover" />
                    <span className="relative z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">第 {thumbIndex + 1} 页</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                      <span aria-hidden="true" className="inline-block h-2 w-1 rounded-sm" style={{ backgroundColor: BRAND }} />
                      第 {thumbIndex + 1} 页
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs font-medium text-slate-700">{thumb.title}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {slide.imagePath ? (
              <div className="relative h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slide.imagePath} alt={slide.title} className="h-full w-full object-cover" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="课件 Logo" className="absolute right-[4%] top-[5%] h-[7%] w-auto object-contain" />
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 lg:gap-4 lg:px-7">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="课件 Logo" className="h-8 w-auto shrink-0 lg:h-10" />
                  <span className="h-8 w-px shrink-0 bg-slate-200 lg:h-9" />
                  <h3 className="min-w-0 flex-1 line-clamp-1 text-lg font-bold tracking-wide text-slate-900 lg:text-2xl">{slide.title}</h3>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="flex min-h-0 flex-1 gap-4 px-5 py-4 lg:gap-6 lg:px-7">
                  <ul className="min-w-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                    {slide.bullets.map((bullet, bulletIndex) => (
                      <li key={`${bullet}-${bulletIndex}`} className="flex gap-3 text-sm text-slate-700 lg:text-base">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: BRAND }} />
                        <span className="min-w-0 break-words">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrent((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />上一页
            </button>
            <span className="text-sm text-slate-500">第 {index + 1} / {slides.length} 页</span>
            {onRegenerateSlide ? <button type="button" disabled={regenerating} onClick={() => void regenerateCurrentSlide()} className="inline-flex items-center gap-1 rounded-lg border border-[#F0C8BE] px-3 py-1.5 text-sm font-medium text-[#8E3425] hover:bg-[#FDF3F0] disabled:opacity-50">{regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}重新生成（1 积分）</button> : null}
            <button
              type="button"
              onClick={() => setCurrent((value) => Math.min(slides.length - 1, value + 1))}
              disabled={index === slides.length - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40"
            >
              下一页<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {regenerateError ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{regenerateError}</p> : null}
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
