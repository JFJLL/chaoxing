"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import type { CourseAiAppType, CourseAiArtifactPayload } from "@/types/courseWorkspace";
import type { CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import {
  confirmCourseAiArtifact,
  createCourseAiArtifact,
  getCourseAiArtifact,
  isActiveAiArtifact,
  publishCourseAiArtifact,
  retryCourseAiArtifact,
  saveCourseAiArtifactRevision,
  type AiArtifactStatus,
  type ManagerAiArtifactDto
} from "@/lib/courseWorkspace/aiArtifactClient";
import { AiArtifactEditor, createArtifactEditorDraft } from "@/components/course-workspace/AiArtifactEditor";
import { Button } from "@/components/ui/Button";

type GeneratorOptions = {
  chapterId: string;
  difficulty: string;
  questionType: string;
  questionCount: number;
  lessonMinutes: number;
  teachingMethod: string;
  slideCount: number;
  coursewareStyle: string;
  paperScore: number;
};

const defaultOptions: GeneratorOptions = {
  chapterId: "",
  difficulty: "基础",
  questionType: "混合",
  questionCount: 5,
  lessonMinutes: 65,
  teachingMethod: "讲授结合实践",
  slideCount: 8,
  coursewareStyle: "课堂讲授",
  paperScore: 100
};

const publishableAppTypes = new Set<CourseAiAppType>(["question_generation", "paper_assembly", "html_courseware"]);

const statusLabels: Record<Exclude<AiArtifactStatus, "QUEUED">, string> = {
  GENERATING: "AI 正在生成内容",
  DRAFT: "草稿待编辑确认",
  FAILED: "AI 调用失败",
  APPROVED: "内容已确认",
  PUBLISHED: "已发布给学生",
  ARCHIVED: "历史版本"
};

export function getAiArtifactStatusText(artifact: Pick<ManagerAiArtifactDto, "status" | "jobsAhead">) {
  if (artifact.status !== "QUEUED") return statusLabels[artifact.status];
  if (artifact.jobsAhead === null) return "等待系统处理";
  if (artifact.jobsAhead === 0) return "即将开始生成";
  return `前方还有 ${artifact.jobsAhead} 个任务`;
}

export function canConfirmAiArtifact(status: AiArtifactStatus, dirty: boolean, busy: boolean) {
  return status === "DRAFT" && !dirty && !busy;
}

export function ArtifactConfirmationNotice({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">有未保存修改，请先保存为新版本后再确认</p>;
}

export function mergeArtifactHistory(current: ManagerAiArtifactDto[], next: ManagerAiArtifactDto) {
  const remaining = current
    .filter((artifact) => artifact.id !== next.id)
    .map((artifact) => next.status === "PUBLISHED" && artifact.seriesId === next.seriesId && artifact.status === "PUBLISHED"
      ? { ...artifact, status: "ARCHIVED" as const }
      : artifact);
  return [next, ...remaining];
}

function parsePayload(artifact: ManagerAiArtifactDto): CourseAiArtifactPayload | null {
  if (!artifact.payload) return null;
  try {
    const value: unknown = JSON.parse(artifact.payload);
    return createArtifactEditorDraft(artifact.appType, artifact.title, value).payload;
  } catch {
    return null;
  }
}

function statusTone(status: AiArtifactStatus) {
  if (status === "FAILED") return "bg-red-50 text-red-700";
  if (status === "PUBLISHED" || status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "QUEUED" || status === "GENERATING") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AiAppGenerator({
  courseId,
  app,
  chapters,
  approvedQuestions,
  coursewareSources,
  initialArtifacts
}: {
  courseId: string;
  app: CourseAiAppDefinition & { appType: CourseAiAppType };
  chapters: Array<{ id: string; title: string }>;
  approvedQuestions: Array<{ id: string; stem: string }>;
  coursewareSources: Array<{ id: string; title: string; version: number; status: string }>;
  initialArtifacts: ManagerAiArtifactDto[];
}) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<GeneratorOptions>(defaultOptions);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [selectedId, setSelectedId] = useState(initialArtifacts[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [sourceArtifactId, setSourceArtifactId] = useState(coursewareSources[0]?.id ?? "");
  const actionLock = useRef(false);

  const selected = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0],
    [artifacts, selectedId]
  );
  const payload = selected ? parsePayload(selected) : null;
  const chapterTitle = chapters.find((chapter) => chapter.id === options.chapterId)?.title ?? "全课程";

  useEffect(() => {
    if (!selected || !isActiveAiArtifact(selected)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const artifactId = selected.id;

    const poll = async () => {
      try {
        const next = await getCourseAiArtifact(courseId, artifactId);
        if (cancelled) return;
        setArtifacts((current) => mergeArtifactHistory(current, next));
        setPollError("");
        if (isActiveAiArtifact(next)) timer = setTimeout(poll, 1500);
      } catch {
        if (cancelled) return;
        setPollError("状态更新失败，正在重试");
        timer = setTimeout(poll, 1500);
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [courseId, selected?.id, selected?.status]);

  useEffect(() => {
    setEditorDirty(false);
  }, [selected?.id]);

  function updateOption<Key extends keyof GeneratorOptions>(key: Key, value: GeneratorOptions[Key]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function structuredPrompt() {
    const common = [`范围：${chapterTitle}`, `难度：${options.difficulty}`];
    if (app.appType === "question_generation") return [...common, `题型：${options.questionType}`, `题量：${options.questionCount}`, `补充要求：${prompt || "无"}`].join("；");
    if (app.appType === "lesson_plan") return [...common, `课时：${options.lessonMinutes}`, `教法：${options.teachingMethod}`, `补充要求：${prompt || "无"}`].join("；");
    if (app.appType === "courseware" || app.appType === "html_courseware") return [...common, `页数：${options.slideCount}`, `风格：${options.coursewareStyle}`, `补充要求：${prompt || "无"}`].join("；");
    return [...common, `总分：${options.paperScore}`, `补充要求：${prompt || "无"}`].join("；");
  }

  function defaultTitle() {
    if (prompt) return `${app.title}：${prompt.slice(0, 18)}`;
    if (app.appType === "question_generation") return `${app.title}：${options.questionType}${options.questionCount}题`;
    if (app.appType === "lesson_plan") return `${app.title}：${options.lessonMinutes}分钟${options.teachingMethod}`;
    if (app.appType === "courseware" || app.appType === "html_courseware") return `${app.title}：${options.coursewareStyle}${options.slideCount}页`;
    return `${app.title}：${options.paperScore}分${options.difficulty}卷`;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionLock.current || (app.appType === "paper_assembly" && approvedQuestions.length < 3) || (app.appType === "html_courseware" && !sourceArtifactId)) return;
    actionLock.current = true;
    setCreating(true);
    setError("");
    try {
      const artifact = await createCourseAiArtifact({
        courseId,
        appType: app.appType,
        prompt: structuredPrompt(),
        title: defaultTitle(),
        scope: options.chapterId ? { kind: "chapter", chapterId: options.chapterId } : { kind: "course" },
        ...(app.appType === "html_courseware" ? { sourceArtifactId } : {})
      });
      setArtifacts((current) => mergeArtifactHistory(current, artifact));
      setSelectedId(artifact.id);
      setPrompt("");
    } catch (submitError) {
      setError(errorMessage(submitError, "AI 调用失败，请重试"));
    } finally {
      actionLock.current = false;
      setCreating(false);
    }
  }

  async function runAction(label: string, operation: () => Promise<ManagerAiArtifactDto>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction(label);
    setError("");
    try {
      const artifact = await operation();
      setArtifacts((current) => mergeArtifactHistory(current, artifact));
      setSelectedId(artifact.id);
    } catch (actionError) {
      setError(errorMessage(actionError, "操作失败，请重试"));
    } finally {
      actionLock.current = false;
      setBusyAction("");
    }
  }

  const isBusy = creating || Boolean(busyAction);
  const generationBlocked = (app.appType === "paper_assembly" && approvedQuestions.length < 3)
    || (app.appType === "html_courseware" && !sourceArtifactId);

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>内容范围</span>
              <select value={options.chapterId} onChange={(event) => updateOption("chapterId", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400">
                <option value="">全课程</option>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700"><span>难度</span><select value={options.difficulty} onChange={(event) => updateOption("difficulty", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>基础</option><option>提高</option><option>综合</option><option>挑战</option></select></label>
          </div>

          {app.appType === "question_generation" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>题型</span><select value={options.questionType} onChange={(event) => updateOption("questionType", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>混合</option><option>单选</option><option>多选</option><option>简答</option></select></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>题量</span><input type="number" min={3} max={12} value={options.questionCount} onChange={(event) => updateOption("questionCount", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label></div> : null}
          {app.appType === "lesson_plan" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>课时分钟</span><input type="number" min={30} max={180} value={options.lessonMinutes} onChange={(event) => updateOption("lessonMinutes", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>教法</span><select value={options.teachingMethod} onChange={(event) => updateOption("teachingMethod", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>讲授结合实践</option><option>任务驱动</option><option>案例研讨</option><option>翻转课堂</option></select></label></div> : null}
          {app.appType === "courseware" || app.appType === "html_courseware" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>页数</span><input type="number" min={5} max={16} value={options.slideCount} onChange={(event) => updateOption("slideCount", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>风格</span><select value={options.coursewareStyle} onChange={(event) => updateOption("coursewareStyle", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>课堂讲授</option><option>案例分析</option><option>实训操作</option><option>复习总结</option></select></label></div> : null}
          {app.appType === "paper_assembly" ? <label className="space-y-1 text-sm font-medium text-slate-700"><span>试卷总分</span><input type="number" min={30} max={150} value={options.paperScore} onChange={(event) => updateOption("paperScore", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label> : null}
          {app.appType === "paper_assembly" ? <div className={`rounded-xl p-3 text-sm ${approvedQuestions.length < 3 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}><p>已审核题目 {approvedQuestions.length} 道</p>{approvedQuestions.length < 3 ? <p className="mt-1">请先生成并审核至少 3 道题目</p> : null}</div> : null}
          {app.appType === "html_courseware" ? <div className="space-y-2"><label className="space-y-1 text-sm font-medium text-slate-700"><span>来源课件</span><select value={sourceArtifactId} onChange={(event) => setSourceArtifactId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option value="">请选择已确认课件</option>{coursewareSources.map((source) => <option key={source.id} value={source.id}>{source.title} · v{source.version} · {source.status === "PUBLISHED" ? "已发布" : "已确认"}</option>)}</select></label>{!coursewareSources.length ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">请先生成并确认 AI 课件，再生成 HTML 课件。<Link className="ml-1 underline" href={`/space/courses/${courseId}/ai-workbench/apps/courseware`}>前往 AI 课件</Link></p> : null}</div> : null}

          <div><label htmlFor="ai-app-prompt" className="text-sm font-medium text-slate-700">生成要求</label><textarea id="ai-app-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={`补充${app.title}要求`} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" /></div>
          <div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-700">{structuredPrompt()}</div>
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isBusy || generationBlocked}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {creating ? "正在创建 AI 任务" : "开始 AI 生成"}
          </Button>
        </form>

        <div className="mt-6"><h2 className="text-sm font-semibold text-slate-900">历史版本</h2><div className="mt-3 space-y-2">
          {artifacts.map((artifact) => <button key={artifact.id} type="button" onClick={() => setSelectedId(artifact.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${selected?.id === artifact.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
            <span className="line-clamp-1 font-medium">{artifact.title}</span>
            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400"><span>v{artifact.version} · {new Date(artifact.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</span><span>{getAiArtifactStatusText(artifact)}</span></span>
          </button>)}
          {!artifacts.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无生成记录</p> : null}
        </div></div>
      </aside>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {!selected ? <p className="text-sm text-slate-500">先填写生成要求，创建第一个 AI 任务。</p> : (
          <>
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div><p className="text-sm text-slate-500">AI 产物 · v{selected.version}</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.title}</h2></div>
              <div className="flex flex-wrap gap-2">
                {selected.status === "FAILED" ? <Button type="button" variant="secondary" disabled={isBusy} onClick={() => runAction("retry", () => retryCourseAiArtifact(courseId, selected.id))}>{busyAction === "retry" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}重试 AI 生成</Button> : null}
                {selected.status === "DRAFT" ? <Button type="button" variant="secondary" disabled={!canConfirmAiArtifact(selected.status, editorDirty, isBusy)} onClick={() => {
                  if (!canConfirmAiArtifact(selected.status, editorDirty, isBusy)) return;
                  runAction("confirm", () => confirmCourseAiArtifact(courseId, selected.id));
                }}>{busyAction === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}确认内容</Button> : null}
                {selected.status === "APPROVED" && publishableAppTypes.has(selected.appType) ? <Button type="button" disabled={isBusy} onClick={() => runAction("publish", () => publishCourseAiArtifact(courseId, selected.id))}>{busyAction === "publish" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}发布给学生</Button> : null}
              </div>
            </div>

            <div aria-live="polite" role="status" className={`mb-5 flex items-start gap-3 rounded-xl p-4 text-sm ${statusTone(selected.status)}`}>
              {isActiveAiArtifact(selected) ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
              <div><p className="font-medium">{getAiArtifactStatusText(selected)}</p>{pollError ? <p className="mt-1 text-amber-700">{pollError}</p> : null}{selected.status === "FAILED" ? <p className="mt-1">{selected.errorMessage ?? "AI 调用失败，请重试"}</p> : null}{selected.status === "APPROVED" && !publishableAppTypes.has(selected.appType) ? <p className="mt-1">已确认（教师内部）</p> : null}</div>
            </div>

            {selected.status === "DRAFT" ? <div className="mb-5"><ArtifactConfirmationNotice dirty={editorDirty} /></div> : null}

            {payload ? <AiArtifactEditor key={selected.id} appType={selected.appType} title={selected.title} payload={payload} approvedQuestions={approvedQuestions} busy={busyAction === "save"} onDirtyChange={setEditorDirty} onSave={(body) => runAction("save", () => saveCourseAiArtifactRevision(courseId, selected.id, body))} /> : selected.status === "FAILED" ? null : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">生成完成后可在此编辑和确认内容。</p>}
          </>
        )}
      </section>
    </div>
  );
}
