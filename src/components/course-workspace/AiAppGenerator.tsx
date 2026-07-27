"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  Edit3,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2
} from "lucide-react";
import type { CourseAiAppType, CourseAiArtifactPayload } from "@/types/courseWorkspace";
import type { CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import {
  confirmCourseAiArtifact,
  confirmCourseAiArtifactUpdate,
  createCourseAiArtifact,
  deleteCourseAiArtifact,
  getCourseAiArtifact,
  isActiveAiArtifact,
  publishCourseAiArtifact,
  retryCourseAiArtifact,
  saveCourseAiArtifactRevision,
  withdrawCourseAiArtifact,
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

type ArtifactExportChoice = {
  label: string;
  format: "DOCX" | "PPTX";
  variant: "DEFAULT" | "STUDENT" | "TEACHER";
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

const publishableAppTypes = new Set<CourseAiAppType>([
  "question_generation",
  "lesson_plan",
  "courseware",
  "paper_assembly",
  "ppt_courseware",
  "html_courseware"
]);

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
  return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">有未保存修改，请先保存后再确认</p>;
}

export function mergeArtifactHistory(current: ManagerAiArtifactDto[], next: ManagerAiArtifactDto) {
  const remaining = current.filter((artifact) => artifact.id !== next.id);
  return [next, ...remaining];
}

function exportChoices(appType: CourseAiAppType): readonly ArtifactExportChoice[] {
  if (appType === "question_generation" || appType === "paper_assembly") {
    return [
      { label: "学生版 Word", format: "DOCX", variant: "STUDENT" },
      { label: "教师版 Word", format: "DOCX", variant: "TEACHER" }
    ] as const;
  }
  if (appType === "ppt_courseware") {
    return [{ label: "PPTX", format: "PPTX", variant: "DEFAULT" }] as const;
  }
  if (appType === "html_courseware") return [] as const;
  return [{ label: "Word", format: "DOCX", variant: "DEFAULT" }] as const;
}

export function buildArtifactExportRequest(choice: Pick<ArtifactExportChoice, "format" | "variant">) {
  return {
    format: choice.format,
    variant: choice.variant
  };
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
  initialArtifacts,
  hasCourseContent = true
}: {
  courseId: string;
  app: CourseAiAppDefinition & { appType: CourseAiAppType };
  chapters: Array<{ id: string; title: string }>;
  approvedQuestions: Array<{ id: string; stem: string }>;
  coursewareSources: Array<{ id: string; title: string; version: number; status: string }>;
  initialArtifacts: ManagerAiArtifactDto[];
  hasCourseContent?: boolean;
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
  const [editingId, setEditingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [exportingId, setExportingId] = useState("");
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
    if (app.appType === "ppt_courseware") return "将已确认的 AI课件直接套用课程模板并导出为 PPTX";
    const common = [`范围：${chapterTitle}`, `难度：${options.difficulty}`];
    if (app.appType === "question_generation") return [...common, `题型：${options.questionType}`, `题量：${options.questionCount}`, `补充要求：${prompt || "无"}`].join("；");
    if (app.appType === "lesson_plan") return [...common, `课时：${options.lessonMinutes}`, `教法：${options.teachingMethod}`, `补充要求：${prompt || "无"}`].join("；");
    if (app.appType === "courseware") return [...common, `页数：${options.slideCount}`, `风格：${options.coursewareStyle}`, `补充要求：${prompt || "无"}`].join("；");
    return [...common, `总分：${options.paperScore}`, `补充要求：${prompt || "无"}`].join("；");
  }

  function defaultTitle() {
    if (app.appType === "ppt_courseware") {
      const source = coursewareSources.find((item) => item.id === sourceArtifactId);
      return `${source?.title ?? "AI课件"}（PPT）`;
    }
    if (prompt) return `${app.title}：${prompt.slice(0, 18)}`;
    if (app.appType === "question_generation") return `${app.title}：${options.questionType}${options.questionCount}题`;
    if (app.appType === "lesson_plan") return `${app.title}：${options.lessonMinutes}分钟${options.teachingMethod}`;
    if (app.appType === "courseware") return `${app.title}：${options.coursewareStyle}${options.slideCount}页`;
    return `${app.title}：${options.paperScore}分${options.difficulty}卷`;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionLock.current || generationBlocked) return;
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
        ...(app.appType === "ppt_courseware" ? { sourceArtifactId } : {})
      });
      setArtifacts((current) => mergeArtifactHistory(current, artifact));
      setSelectedId(artifact.id);
      setEditingId(app.appType === "ppt_courseware" ? "" : artifact.id);
      setPrompt("");
      if (app.appType === "ppt_courseware") {
        await exportArtifact(artifact, { format: "PPTX", variant: "DEFAULT" });
      }
    } catch (submitError) {
      setError(errorMessage(submitError, "AI 调用失败，请重试"));
    } finally {
      actionLock.current = false;
      setCreating(false);
    }
  }

  async function runAction(label: string, operation: () => Promise<ManagerAiArtifactDto>) {
    if (actionLock.current) return false;
    actionLock.current = true;
    setBusyAction(label);
    setError("");
    try {
      const artifact = await operation();
      setArtifacts((current) => mergeArtifactHistory(current, artifact));
      setSelectedId(artifact.id);
      setEditorDirty(false);
      return true;
    } catch (actionError) {
      setError(errorMessage(actionError, "操作失败，请重试"));
      return false;
    } finally {
      actionLock.current = false;
      setBusyAction("");
    }
  }

  function selectArtifact(id: string) {
    if (editorDirty && selected?.id !== id && !window.confirm("当前修改尚未保存，确定离开吗？")) return;
    setSelectedId(id);
    setEditingId("");
    setEditorDirty(false);
  }

  async function removeArtifact(artifact: ManagerAiArtifactDto) {
    if (artifact.status === "PUBLISHED") {
      setError("已发布内容必须先在详情中撤回，再删除");
      return;
    }
    if (!window.confirm(`确定删除“${artifact.title}”吗？`)) return;
    setDeletingId(artifact.id);
    setError("");
    try {
      await deleteCourseAiArtifact(courseId, artifact.id, artifact.lockVersion ?? 0);
      setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
      if (selectedId === artifact.id) {
        const next = artifacts.find((item) => item.id !== artifact.id);
        setSelectedId(next?.id ?? "");
        setEditingId("");
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError, "删除失败，请重试"));
    } finally {
      setDeletingId("");
    }
  }

  async function exportArtifact(
    artifact: ManagerAiArtifactDto,
    choice: Pick<ArtifactExportChoice, "format" | "variant">
  ) {
    setExportingId(artifact.id);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-artifacts/${artifact.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildArtifactExportRequest(choice))
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "导出失败，请重试");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      anchor.download = encodedName
        ? decodeURIComponent(encodedName)
        : `${artifact.title}.${choice.format === "PPTX" ? "pptx" : "docx"}`;
      anchor.href = url;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(errorMessage(exportError, "导出失败，请重试"));
    } finally {
      setExportingId("");
    }
  }

  const isBusy = creating || Boolean(busyAction);
  const prerequisites = app.prerequisites ?? (
    app.appType === "paper_assembly"
      ? ["approved_questions" as const]
      : app.appType === "ppt_courseware"
        ? ["approved_courseware" as const]
        : ["course_content" as const]
  );
  const missingCourseContent = prerequisites.includes("course_content") && !hasCourseContent;
  const missingApprovedQuestions = prerequisites.includes("approved_questions") && approvedQuestions.length < 3;
  const missingApprovedCourseware = prerequisites.includes("approved_courseware") && !sourceArtifactId;
  const generationBlocked = missingCourseContent || missingApprovedQuestions || missingApprovedCourseware;
  const isEditing = Boolean(selected && editingId === selected.id);
  const hasPendingPublishedUpdate = Boolean(
    selected
    && selected.status === "PUBLISHED"
    && selected.publishedPayload != null
    && selected.payload !== selected.publishedPayload
  );
  const canEditSelected = Boolean(
    selected
    && selected.payload
    && ["DRAFT", "APPROVED", "PUBLISHED"].includes(selected.status)
    && selected.appType !== "html_courseware"
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {app.appType === "html_courseware" ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            HTML 互动课件已停止生成。这里仅保留历史内容查看，请改用 PPT 课件。
          </p>
        ) : null}
        <form onSubmit={submit} className={app.appType === "html_courseware" ? "hidden" : "space-y-4"}>
          {app.appType !== "ppt_courseware" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>内容范围</span>
              <select value={options.chapterId} onChange={(event) => updateOption("chapterId", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400">
                <option value="">全课程</option>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700"><span>难度</span><select value={options.difficulty} onChange={(event) => updateOption("difficulty", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>基础</option><option>提高</option><option>综合</option><option>挑战</option></select></label>
          </div> : null}

          {app.appType === "question_generation" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>题型</span><select value={options.questionType} onChange={(event) => updateOption("questionType", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>混合</option><option>单选</option><option>多选</option><option>简答</option></select></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>题量</span><input type="number" min={3} max={12} value={options.questionCount} onChange={(event) => updateOption("questionCount", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label></div> : null}
          {app.appType === "lesson_plan" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>课时分钟</span><input type="number" min={30} max={180} value={options.lessonMinutes} onChange={(event) => updateOption("lessonMinutes", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>教法</span><select value={options.teachingMethod} onChange={(event) => updateOption("teachingMethod", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>讲授结合实践</option><option>任务驱动</option><option>案例研讨</option><option>翻转课堂</option></select></label></div> : null}
          {app.appType === "courseware" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>页数</span><input type="number" min={5} max={16} value={options.slideCount} onChange={(event) => updateOption("slideCount", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>风格</span><select value={options.coursewareStyle} onChange={(event) => updateOption("coursewareStyle", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>课堂讲授</option><option>案例分析</option><option>实训操作</option><option>复习总结</option></select></label></div> : null}
          {app.appType === "paper_assembly" ? <label className="space-y-1 text-sm font-medium text-slate-700"><span>试卷总分</span><input type="number" min={30} max={150} value={options.paperScore} onChange={(event) => updateOption("paperScore", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label> : null}
          {app.appType === "paper_assembly" ? <div className={`rounded-xl p-3 text-sm ${missingApprovedQuestions ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-700"}`}><p>已审核题目 {approvedQuestions.length} 道</p>{missingApprovedQuestions ? <div className="mt-2"><p>请先生成并审核至少 3 道题目。</p><div className="mt-3 flex flex-wrap gap-3"><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/ai-workbench/apps/question_generation`}>去 AI出题</Link><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/question-bank`}>审核题库</Link></div></div> : null}</div> : null}
          {app.appType === "ppt_courseware" ? <div className="space-y-3"><div className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-800"><p className="font-medium">直接将已有课件转换为 PPT</p><p className="mt-1">不会再次调用 AI 生成内容；系统会使用已确认课件并套用课程 PPT 模板。</p></div><label className="space-y-1 text-sm font-medium text-slate-700"><span>来源课件</span><select value={sourceArtifactId} onChange={(event) => setSourceArtifactId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option value="">请选择已确认课件</option>{coursewareSources.map((source) => <option key={source.id} value={source.id}>{source.title} · {source.status === "PUBLISHED" ? "已发布" : "已确认"}</option>)}</select></label>{missingApprovedCourseware ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">还没有可用的来源课件。先生成并确认一份 AI课件，再回来制作 PPT。<Link className="ml-1 font-medium underline underline-offset-4" href={`/space/courses/${courseId}/ai-workbench/apps/courseware`}>生成 AI课件</Link></p> : null}</div> : null}

          {app.appType !== "ppt_courseware" ? <><div><label htmlFor="ai-app-prompt" className="text-sm font-medium text-slate-700">生成要求</label><textarea id="ai-app-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={`补充${app.title}要求`} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" /></div><div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-700">{structuredPrompt()}</div></> : null}
          {missingCourseContent ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">当前课程还没有可用于 AI 生成的内容</p><p className="mt-1 leading-5">先导入课程文档或添加课程资料，系统才知道应该依据什么生成。</p><div className="mt-3 flex flex-wrap gap-3"><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/ai-workbench/content`}>AI文档建课</Link><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/resources`}>查看课程资料库</Link></div></div> : null}
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isBusy || generationBlocked}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : app.appType === "ppt_courseware" ? <Download className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {creating ? (app.appType === "ppt_courseware" ? "正在生成 PPT" : "正在创建 AI 任务") : (app.appType === "ppt_courseware" ? "生成并下载 PPT" : "开始 AI 生成")}
          </Button>
        </form>

        {error && app.appType === "html_courseware" ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6"><h2 className="text-sm font-semibold text-slate-900">历史产物</h2><div className="mt-3 space-y-2">
          {artifacts.map((artifact) => {
            const choices = exportChoices(artifact.appType);
            const exportable = Boolean(artifact.payload) && !isActiveAiArtifact(artifact) && artifact.status !== "FAILED" && choices.length > 0;
            return (
              <article key={artifact.id} className={`rounded-xl border p-3 text-sm transition ${selected?.id === artifact.id ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"}`}>
                <button type="button" onClick={() => selectArtifact(artifact.id)} className="w-full text-left">
                  <span className={`line-clamp-1 font-medium ${selected?.id === artifact.id ? "text-blue-700" : "text-slate-700"}`}>{artifact.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400"><span>{new Date(artifact.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</span><span>{getAiArtifactStatusText(artifact)}</span></span>
                </button>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-200/70 pt-2">
                  {choices.length === 1 ? (
                    <button type="button" disabled={!exportable || exportingId === artifact.id} onClick={() => exportArtifact(artifact, choices[0]!)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 disabled:text-slate-300">
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />{exportingId === artifact.id ? "导出中" : "导出"}
                    </button>
                  ) : choices.length > 1 ? (
                    <details className="relative">
                      <summary className={`inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium ${exportable ? "text-blue-600" : "pointer-events-none text-slate-300"}`}>
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />{exportingId === artifact.id ? "导出中" : "导出"}
                      </summary>
                      <div className="absolute left-0 top-6 z-20 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        {choices.map((choice) => <button key={`${choice.format}:${choice.variant}`} type="button" onClick={() => exportArtifact(artifact, choice)} className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">{choice.label}</button>)}
                      </div>
                    </details>
                  ) : null}
                  <button type="button" disabled={deletingId === artifact.id} onClick={() => removeArtifact(artifact)} className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${artifact.status === "PUBLISHED" ? "text-slate-400" : "text-red-600"}`} title={artifact.status === "PUBLISHED" ? "请先撤回再删除" : "删除"}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{deletingId === artifact.id ? "删除中" : "删除"}
                  </button>
                </div>
              </article>
            );
          })}
          {!artifacts.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无生成记录</p> : null}
        </div></div>
      </aside>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {!selected ? <div className="flex min-h-[360px] items-center justify-center"><div className="max-w-md text-center"><Sparkles className="mx-auto h-9 w-9 text-blue-500" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold text-slate-900">{app.appType === "html_courseware" ? "暂无历史 HTML 课件" : app.appType === "ppt_courseware" ? "选择已有 AI课件制作 PPT" : `准备开始${app.title}`}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{app.appType === "html_courseware" ? "HTML 互动课件已停止生成。这里仅保留已有内容查看，请使用 PPT 课件。" : app.appType === "ppt_courseware" ? "选择一份已确认或已发布的 AI课件，系统会直接套用 PPT 模板并下载，不会重复生成课件内容。" : <>填写生成要求 → AI 生成草稿 → 编辑确认{publishableAppTypes.has(app.appType) ? " → 发布给学生" : ""}。生成完成后可在这里逐项编辑，不会直接发布。</>}</p></div></div> : (
          <>
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div><p className="text-sm text-slate-500">AI 产物</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.title}</h2></div>
              <div className="flex flex-wrap gap-2">
                {selected.status === "FAILED" ? <Button type="button" variant="secondary" disabled={isBusy} onClick={() => runAction("retry", () => retryCourseAiArtifact(courseId, selected.id))}>{busyAction === "retry" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}重试 AI 生成</Button> : null}
                {canEditSelected && !isEditing ? <Button type="button" variant="secondary" disabled={isBusy} onClick={() => setEditingId(selected.id)}><Edit3 className="h-4 w-4" aria-hidden="true" />编辑</Button> : null}
                {selected.status === "DRAFT" && !isEditing ? <Button type="button" variant="secondary" disabled={!canConfirmAiArtifact(selected.status, editorDirty, isBusy)} onClick={() => {
                  if (!canConfirmAiArtifact(selected.status, editorDirty, isBusy)) return;
                  runAction("confirm", () => confirmCourseAiArtifact(courseId, selected.id, selected.lockVersion ?? 0));
                }}>{busyAction === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}确认内容</Button> : null}
                {selected.status === "APPROVED" && publishableAppTypes.has(selected.appType) && !isEditing ? <Button type="button" disabled={isBusy} onClick={() => runAction("publish", () => publishCourseAiArtifact(courseId, selected.id, selected.lockVersion ?? 0))}>{busyAction === "publish" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}发布给学生</Button> : null}
                {hasPendingPublishedUpdate && !isEditing ? <Button type="button" disabled={isBusy} onClick={() => runAction("confirm-update", () => confirmCourseAiArtifactUpdate(courseId, selected.id, selected.lockVersion ?? 0))}>{busyAction === "confirm-update" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}确认更新</Button> : null}
                {selected.status === "PUBLISHED" && !isEditing ? <Button type="button" variant="secondary" disabled={isBusy} onClick={() => runAction("withdraw", () => withdrawCourseAiArtifact(courseId, selected.id, selected.lockVersion ?? 0))}>{busyAction === "withdraw" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}撤回</Button> : null}
              </div>
            </div>

            <div aria-live="polite" role="status" className={`mb-5 flex items-start gap-3 rounded-xl p-4 text-sm ${statusTone(selected.status)}`}>
              {isActiveAiArtifact(selected) ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
              <div><p className="font-medium">{getAiArtifactStatusText(selected)}</p>{hasPendingPublishedUpdate ? <p className="mt-1">学生仍在查看上一次发布内容，确认更新后才会替换。</p> : null}{pollError ? <p className="mt-1 text-amber-700">{pollError}</p> : null}{selected.status === "FAILED" ? <p className="mt-1">{selected.errorMessage ?? "AI 调用失败，请重试"}</p> : null}</div>
            </div>

            {selected.status === "DRAFT" ? <div className="mb-5"><ArtifactConfirmationNotice dirty={editorDirty} /></div> : null}

            <div className="max-h-[720px] overflow-y-auto pr-1">
              {payload ? <AiArtifactEditor key={`${selected.id}-${isEditing ? "edit" : "read"}`} appType={selected.appType} title={selected.title} payload={payload} approvedQuestions={approvedQuestions} busy={busyAction === "save"} editable={isEditing} onDirtyChange={setEditorDirty} onSave={async (body) => {
                const saved = await runAction("save", () => saveCourseAiArtifactRevision(courseId, selected.id, {
                  ...body,
                  lockVersion: selected.lockVersion ?? 0
                }));
                if (saved) setEditingId("");
              }} /> : selected.status === "FAILED" ? null : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">生成完成后可在此编辑和确认内容。</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
