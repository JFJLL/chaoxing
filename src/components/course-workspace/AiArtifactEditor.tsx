"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  aiCoursewarePayloadSchema,
  aiLessonPlanPayloadSchema,
  aiPaperPayloadSchema,
  aiQuestionPayloadSchema,
  htmlCoursewarePayloadSchema,
  type AiCoursewarePayload,
  type AiLessonPlanPayload,
  type AiPaperPayload,
  type AiQuestionPayload,
  type CourseAiAppType,
  type CourseAiArtifactPayload,
  type HtmlCoursewarePayload
} from "@/types/courseWorkspace";

export type ArtifactEditorDraft =
  | { appType: "question_generation"; title: string; payload: AiQuestionPayload }
  | { appType: "lesson_plan"; title: string; payload: AiLessonPlanPayload }
  | { appType: "courseware"; title: string; payload: AiCoursewarePayload }
  | { appType: "paper_assembly"; title: string; payload: AiPaperPayload }
  | { appType: "html_courseware"; title: string; payload: HtmlCoursewarePayload };

export function createArtifactEditorDraft(
  appType: CourseAiAppType,
  title: string,
  payload: unknown
): ArtifactEditorDraft {
  if (appType === "question_generation") return { appType, title, payload: aiQuestionPayloadSchema.parse(payload) };
  if (appType === "lesson_plan") return { appType, title, payload: aiLessonPlanPayloadSchema.parse(payload) };
  if (appType === "courseware") return { appType, title, payload: aiCoursewarePayloadSchema.parse(payload) };
  if (appType === "paper_assembly") return { appType, title, payload: aiPaperPayloadSchema.parse(payload) };
  return { appType, title, payload: htmlCoursewarePayloadSchema.parse(payload) };
}

export function editorDraftToRevisionBody(draft: ArtifactEditorDraft) {
  if (draft.appType !== "question_generation") {
    return { title: draft.title, payload: draft.payload };
  }
  return {
    title: draft.title,
    payload: {
      questions: draft.payload.questions.map((question) => ({
        ...(question.id ? { id: question.id } : {}),
        type: question.type,
        stem: question.stem,
        ...(question.options ? { options: question.options } : {}),
        answer: question.answer,
        explanation: question.explanation
      }))
    }
  };
}

type ApprovedQuestionOption = { id: string; stem: string };

type Props = {
  appType: CourseAiAppType;
  title: string;
  payload: CourseAiArtifactPayload;
  approvedQuestions?: ApprovedQuestionOption[];
  onSave: (body: { title: string; payload: unknown }) => void | Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  busy: boolean;
};

const inputClass = "h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400";
const textareaClass = "min-h-20 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400";

function cloneDraft(draft: ArtifactEditorDraft) {
  return structuredClone(draft);
}

function move<Item>(items: Item[], index: number, direction: -1 | 1) {
  const destination = index + direction;
  if (destination < 0 || destination >= items.length) return;
  [items[index], items[destination]] = [items[destination]!, items[index]!];
}

function ItemActions({ index, length, onMove, onRemove }: {
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="secondary" className="h-8 px-2" disabled={index === 0} onClick={() => onMove(-1)} aria-label="上移">
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="secondary" className="h-8 px-2" disabled={index === length - 1} onClick={() => onMove(1)} aria-label="下移">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="danger" className="h-8 px-2" disabled={length === 1} onClick={onRemove} aria-label="删除">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function TextList({ label, items, onChange }: { label: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-slate-900">{label}</legend>
      {items.map((item, index) => (
        <div key={`${label}-${index}`} className="flex items-start gap-2">
          <textarea
            value={item}
            onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? event.target.value : current))}
            className={textareaClass}
            aria-label={`${label} ${index + 1}`}
          />
          <Button type="button" variant="danger" className="h-10 px-2" disabled={items.length === 1} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`删除${label} ${index + 1}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...items, ""])}>
        <Plus className="h-4 w-4" aria-hidden="true" />新增{label}
      </Button>
    </fieldset>
  );
}

export function AiArtifactEditor({ appType, title, payload, approvedQuestions = [], onSave, onDirtyChange, busy }: Props) {
  const [draft, setDraft] = useState(() => createArtifactEditorDraft(appType, title, payload));

  function update(mutator: (next: ArtifactEditorDraft) => void) {
    onDirtyChange(true);
    setDraft((current) => {
      const next = cloneDraft(current);
      mutator(next);
      return next;
    });
  }

  if (draft.appType === "html_courseware") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          HTML 课件是已确认课件的视觉版本，仅支持安全预览，不允许直接修改教学内容。
        </div>
        <iframe title="HTML课件预览" srcDoc={draft.payload.html} sandbox="allow-scripts" className="h-[520px] w-full rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(editorDraftToRevisionBody(draft));
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block space-y-1 text-sm font-semibold text-slate-900">
        <span>产物标题</span>
        <input value={draft.title} onChange={(event) => update((next) => { next.title = event.target.value; })} className={inputClass} required />
      </label>

      {draft.appType === "question_generation" ? (
        <div className="space-y-4">
          {draft.payload.questions.map((question, index) => (
            <fieldset key={question.id ?? `new-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-900">题目 {index + 1}{question.id ? " · 已有题目 ID" : " · 新题"}</legend>
              <div className="flex justify-end"><ItemActions index={index} length={draft.payload.questions.length} onMove={(direction) => update((next) => { if (next.appType === "question_generation") move(next.payload.questions, index, direction); })} onRemove={() => update((next) => { if (next.appType === "question_generation") next.payload.questions.splice(index, 1); })} /></div>
              <label className="block text-sm text-slate-700">题型
                <select value={question.type} className={inputClass} onChange={(event) => update((next) => {
                  if (next.appType !== "question_generation") return;
                  const target = next.payload.questions[index]!;
                  target.type = event.target.value as typeof target.type;
                  if (target.type === "short_answer") delete target.options;
                  else if (!target.options) target.options = ["", ""];
                })}>
                  <option value="single_choice">单选题</option><option value="multiple_choice">多选题</option><option value="short_answer">简答题</option>
                </select>
              </label>
              <label className="block text-sm text-slate-700">题干<textarea value={question.stem} className={textareaClass} onChange={(event) => update((next) => { if (next.appType === "question_generation") next.payload.questions[index]!.stem = event.target.value; })} required /></label>
              {question.options ? <TextList label="选项" items={question.options} onChange={(items) => update((next) => { if (next.appType === "question_generation") next.payload.questions[index]!.options = items; })} /> : null}
              <label className="block text-sm text-slate-700">答案<textarea value={question.answer} className={textareaClass} onChange={(event) => update((next) => { if (next.appType === "question_generation") next.payload.questions[index]!.answer = event.target.value; })} required /></label>
              <label className="block text-sm text-slate-700">解析<textarea value={question.explanation} className={textareaClass} onChange={(event) => update((next) => { if (next.appType === "question_generation") next.payload.questions[index]!.explanation = event.target.value; })} required /></label>
            </fieldset>
          ))}
          <Button type="button" variant="secondary" onClick={() => update((next) => {
            if (next.appType === "question_generation") next.payload.questions.push({ type: "short_answer", stem: "", answer: "", explanation: "" });
          })}><Plus className="h-4 w-4" aria-hidden="true" />新增题目</Button>
        </div>
      ) : null}

      {draft.appType === "lesson_plan" ? (
        <div className="space-y-5">
          <TextList label="教学目标" items={draft.payload.objectives} onChange={(items) => update((next) => { if (next.appType === "lesson_plan") next.payload.objectives = items; })} />
          <TextList label="教学重点" items={draft.payload.keyPoints} onChange={(items) => update((next) => { if (next.appType === "lesson_plan") next.payload.keyPoints = items; })} />
          <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-900">教学过程</legend>
            {draft.payload.teachingProcess.map((phase, index) => (
              <div key={`${phase.phase}-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex justify-end"><ItemActions index={index} length={draft.payload.teachingProcess.length} onMove={(direction) => update((next) => { if (next.appType === "lesson_plan") move(next.payload.teachingProcess, index, direction); })} onRemove={() => update((next) => { if (next.appType === "lesson_plan") next.payload.teachingProcess.splice(index, 1); })} /></div>
                <div className="grid gap-3 md:grid-cols-[1fr_120px]"><label className="text-sm text-slate-700">环节<input className={inputClass} value={phase.phase} onChange={(event) => update((next) => { if (next.appType === "lesson_plan") next.payload.teachingProcess[index]!.phase = event.target.value; })} /></label><label className="text-sm text-slate-700">分钟<input type="number" min={1} max={480} className={inputClass} value={phase.minutes} onChange={(event) => update((next) => { if (next.appType === "lesson_plan") next.payload.teachingProcess[index]!.minutes = Number(event.target.value); })} /></label></div>
                <label className="block text-sm text-slate-700">教学活动<textarea className={textareaClass} value={phase.activity} onChange={(event) => update((next) => { if (next.appType === "lesson_plan") next.payload.teachingProcess[index]!.activity = event.target.value; })} /></label>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => update((next) => { if (next.appType === "lesson_plan") next.payload.teachingProcess.push({ phase: "", minutes: 10, activity: "" }); })}><Plus className="h-4 w-4" aria-hidden="true" />新增教学环节</Button>
          </fieldset>
          <TextList label="评价方式" items={draft.payload.assessment} onChange={(items) => update((next) => { if (next.appType === "lesson_plan") next.payload.assessment = items; })} />
        </div>
      ) : null}

      {draft.appType === "courseware" ? (
        <div className="space-y-4">
          {draft.payload.slides.map((slide, index) => (
            <fieldset key={`${slide.title}-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-900">幻灯片 {index + 1}</legend>
              <div className="flex justify-end"><ItemActions index={index} length={draft.payload.slides.length} onMove={(direction) => update((next) => { if (next.appType === "courseware") move(next.payload.slides, index, direction); })} onRemove={() => update((next) => { if (next.appType === "courseware") next.payload.slides.splice(index, 1); })} /></div>
              <label className="block text-sm text-slate-700">标题<input className={inputClass} value={slide.title} onChange={(event) => update((next) => { if (next.appType === "courseware") next.payload.slides[index]!.title = event.target.value; })} /></label>
              <TextList label="要点" items={slide.bullets} onChange={(items) => update((next) => { if (next.appType === "courseware") next.payload.slides[index]!.bullets = items; })} />
              <label className="block text-sm text-slate-700">讲稿备注<textarea className={textareaClass} value={slide.speakerNotes} onChange={(event) => update((next) => { if (next.appType === "courseware") next.payload.slides[index]!.speakerNotes = event.target.value; })} /></label>
            </fieldset>
          ))}
          <Button type="button" variant="secondary" onClick={() => update((next) => { if (next.appType === "courseware") next.payload.slides.push({ title: "", bullets: [""], speakerNotes: "" }); })}><Plus className="h-4 w-4" aria-hidden="true" />新增幻灯片</Button>
        </div>
      ) : null}

      {draft.appType === "paper_assembly" ? (
        <div className="space-y-4">
          <label className="block text-sm text-slate-700">试卷标题<input className={inputClass} value={draft.payload.title} onChange={(event) => update((next) => { if (next.appType === "paper_assembly") next.payload.title = event.target.value; })} /></label>
          {draft.payload.sections.map((section, index) => (
            <fieldset key={`${section.name}-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-900">试卷分区 {index + 1}</legend>
              <div className="flex justify-end"><ItemActions index={index} length={draft.payload.sections.length} onMove={(direction) => update((next) => { if (next.appType === "paper_assembly") move(next.payload.sections, index, direction); })} onRemove={() => update((next) => { if (next.appType === "paper_assembly") next.payload.sections.splice(index, 1); })} /></div>
              <div className="grid gap-3 md:grid-cols-[1fr_140px]"><label className="text-sm text-slate-700">分区名称<input className={inputClass} value={section.name} onChange={(event) => update((next) => { if (next.appType === "paper_assembly") next.payload.sections[index]!.name = event.target.value; })} /></label><label className="text-sm text-slate-700">分值<input type="number" min={1} max={1000} className={inputClass} value={section.score} onChange={(event) => update((next) => { if (next.appType === "paper_assembly") next.payload.sections[index]!.score = Number(event.target.value); })} /></label></div>
              <fieldset className="space-y-2"><legend className="text-sm text-slate-700">题目（只能选择当前课程已审核题库中的真实 ID）</legend>
                {approvedQuestions.map((question) => <label key={question.id} className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={section.questionIds.includes(question.id)} onChange={(event) => update((next) => { if (next.appType !== "paper_assembly") return; const ids = next.payload.sections[index]!.questionIds; next.payload.sections[index]!.questionIds = event.target.checked ? [...ids, question.id] : ids.filter((id) => id !== question.id); })} /><span><span className="font-medium">{question.stem}</span><span className="mt-1 block text-xs text-slate-400">{question.id}</span></span></label>)}
                {!approvedQuestions.length ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">暂无已审核题目，请先到 AI 出题完成审核。</p> : null}
              </fieldset>
            </fieldset>
          ))}
          <Button type="button" variant="secondary" onClick={() => update((next) => { if (next.appType === "paper_assembly") next.payload.sections.push({ name: "", score: 10, questionIds: [] }); })}><Plus className="h-4 w-4" aria-hidden="true" />新增试卷分区</Button>
        </div>
      ) : null}

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button type="submit" disabled={busy || !draft.title.trim()}>
          <Save className="h-4 w-4" aria-hidden="true" />{busy ? "正在保存" : "保存为新版本"}
        </Button>
      </div>
    </form>
  );
}
