"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Loader2,
  RefreshCw,
  Save,
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
import { CollapsibleSourcePanel } from "@/components/course-workspace/CollapsibleSourcePanel";
import { PptCoursewarePreview } from "@/components/course-workspace/PptCoursewarePreview";
import { SLIDE_COUNT_MAX, SLIDE_COUNT_MIN } from "@/lib/courseWorkspace/recommendSlideCount";
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
  "ppt_courseware"
]);

const topSaveAppTypes = new Set<CourseAiAppType>([
  "lesson_plan",
  "courseware"
]);

const statusLabels: Record<Exclude<AiArtifactStatus, "QUEUED">, string> = {
  GENERATING: "AI 正在生成内容",
  DRAFT: "草稿待编辑确认",
  FAILED: "AI 调用失败",
  APPROVED: "内容已确认",
  PUBLISHED: "已发布给学生",
  ARCHIVED: "历史版本"
};

export function getAiArtifactStatusText(artifact: Pick<ManagerAiArtifactDto, "status" | "jobsAhead"> & { appType?: CourseAiAppType }) {
  if (artifact.status === "PUBLISHED" && artifact.appType && !publishableAppTypes.has(artifact.appType)) return "内容已确认";
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

// A recommendation response is only usable when it is for the source we last
// asked about; fast source switching must not apply a stale answer.
export function isRecommendationForSource(responseSource: string | undefined, requestedSource: string) {
  return typeof responseSource === "string" && responseSource === requestedSource;
}

// The AI suggestion may auto-fill the control only while the teacher has not
// manually edited the page count.
export function shouldAutoApplyRecommendation(slideCountTouched: boolean) {
  return !slideCountTouched;
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
  documentSources = [],
  preferredSourceId,
  initialArtifacts,
  hasCourseContent = true
}: {
  courseId: string;
  app: CourseAiAppDefinition & { appType: CourseAiAppType };
  chapters: Array<{ id: string; title: string }>;
  approvedQuestions: Array<{ id: string; stem: string }>;
  coursewareSources: Array<{ id: string; title: string; version: number; status: string }>;
  documentSources?: Array<{ id: string; title: string; sections: Array<{ id: string; title: string }> }>;
  preferredSourceId?: string;
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
  const [sourceArtifactId, setSourceArtifactId] = useState(
    coursewareSources.some((source) => source.id === preferredSourceId) ? preferredSourceId! : coursewareSources[0]?.id ?? ""
  );
  const [sourceSelections, setSourceSelections] = useState<Record<string, string[]>>({});
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(new Set());
  const [savedNotice, setSavedNotice] = useState(false);
  const [recommendedSlideCount, setRecommendedSlideCount] = useState<number | null>(null);
  const [recommendationReason, setRecommendationReason] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [slideCountTouched, setSlideCountTouched] = useState(false);
  const actionLock = useRef(false);
  const recommendationRequestId = useRef(0);
  const recommendationResolvedSource = useRef("");
  const slideCountTouchedRef = useRef(false);

  useEffect(() => {
    slideCountTouchedRef.current = slideCountTouched;
  }, [slideCountTouched]);

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
    setSavedNotice(false);
  }, [selected?.id]);

  function updateOption<Key extends keyof GeneratorOptions>(key: Key, value: GeneratorOptions[Key]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function toggleDocumentExpanded(documentId: string) {
    // Expanding a document must never touch its checkbox selection.
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }

  const fetchSlideRecommendation = useCallback(async (targetSource: string) => {
    const requestId = recommendationRequestId.current + 1;
    recommendationRequestId.current = requestId;
    setRecommendationLoading(true);
    setRecommendationError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-apps/courseware/recommend-slide-count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceArtifactId: targetSource })
      });
      const body = (await response.json().catch(() => null)) as {
        recommendedSlideCount?: number;
        reason?: string;
        sourceArtifactId?: string;
        error?: string;
      } | null;
      // Discard responses that lost the race to a newer request, or that do not
      // match the source we asked about (fast source switching).
      if (requestId !== recommendationRequestId.current) return;
      if (!response.ok || !body || typeof body.recommendedSlideCount !== "number" || !isRecommendationForSource(body.sourceArtifactId, targetSource)) {
        setRecommendationError(body?.error ?? "AI 页数建议暂不可用");
        return;
      }
      recommendationResolvedSource.current = targetSource;
      setRecommendedSlideCount(body.recommendedSlideCount);
      setRecommendationReason(typeof body.reason === "string" ? body.reason : "");
      // Only auto-fill when the teacher has not manually touched the control.
      if (shouldAutoApplyRecommendation(slideCountTouchedRef.current)) {
        setOptions((current) => ({ ...current, slideCount: body.recommendedSlideCount! }));
      }
    } catch {
      if (requestId === recommendationRequestId.current) setRecommendationError("AI 页数建议暂不可用");
    } finally {
      if (requestId === recommendationRequestId.current) setRecommendationLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    // The AI page-count suggestion is triggered manually by the teacher, so
    // opening the app or switching source never auto-calls the model. Reset any
    // previous suggestion (and cancel in-flight requests) when the source
    // changes so the trigger button reappears for the new source.
    if (app.appType !== "courseware") return;
    recommendationRequestId.current += 1;
    recommendationResolvedSource.current = "";
    setRecommendationLoading(false);
    setRecommendedSlideCount(null);
    setRecommendationReason("");
    setRecommendationError("");
  }, [app.appType, sourceArtifactId]);

  function retrySlideRecommendation() {
    if (!sourceArtifactId) return;
    recommendationResolvedSource.current = "";
    void fetchSlideRecommendation(sourceArtifactId);
  }

  // Manual trigger for the AI page-count suggestion (teacher clicks the button).
  function requestSlideRecommendation() {
    if (!sourceArtifactId || recommendationLoading) return;
    recommendationResolvedSource.current = "";
    void fetchSlideRecommendation(sourceArtifactId);
  }

  function adoptRecommendedSlideCount() {
    if (recommendedSlideCount === null) return;
    slideCountTouchedRef.current = true;
    setSlideCountTouched(true);
    setOptions((current) => ({ ...current, slideCount: recommendedSlideCount }));
  }

  function toggleDocument(documentId: string) {
    setSourceSelections((current) => {
      const next = { ...current };
      if (documentId in next) delete next[documentId];
      else next[documentId] = [];
      return next;
    });
  }

  function toggleDocumentSection(documentId: string, sectionId: string, allSectionIds: string[]) {
    setSourceSelections((current) => {
      const selected = current[documentId];
      const next = { ...current };
      if (selected === undefined) next[documentId] = [sectionId];
      else if (selected.length === 0) next[documentId] = allSectionIds.filter((id) => id !== sectionId);
      else {
        const updated = selected.includes(sectionId) ? selected.filter((id) => id !== sectionId) : [...selected, sectionId];
        if (!updated.length) delete next[documentId];
        else if (updated.length === allSectionIds.length) next[documentId] = [];
        else next[documentId] = updated;
      }
      return next;
    });
  }

  function structuredPrompt() {
    if (app.appType === "ppt_courseware") return "将已确认的 AI课件直接套用课程模板并导出为 PPTX";
    const common = [`范围：${chapterTitle}`, `难度：${options.difficulty}`];
    if (app.appType === "question_generation") return [...common, `题型：${options.questionType}`, `题量：${options.questionCount}`, `补充要求：${prompt || "无"}`].join("；");
    if (app.appType === "lesson_plan") return [...common, `课时：${options.lessonMinutes}`, `教法：${options.teachingMethod}`, `补充要求：${prompt || "无"}`].join("；");
    if (app.appType === "courseware") return [`来源教案：${coursewareSources.find((item) => item.id === sourceArtifactId)?.title ?? "未选择"}`, `页数：${options.slideCount}`, `风格：${options.coursewareStyle}`, `补充要求：${prompt || "无"}`].join("；");
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
        ...(app.appType === "courseware" || app.appType === "ppt_courseware" ? { sourceArtifactId } : {}),
        ...(app.appType === "courseware" ? {
          slideCountPlan: {
            requestedSlideCount: Math.min(SLIDE_COUNT_MAX, Math.max(SLIDE_COUNT_MIN, Math.trunc(options.slideCount) || SLIDE_COUNT_MIN)),
            recommendedSlideCount,
            recommendationAccepted: recommendedSlideCount !== null && options.slideCount === recommendedSlideCount,
            sourceArtifactId,
            sourceArtifactVersion: selectedCoursewareSource?.version ?? null
          }
        } : {}),
        ...(app.appType === "lesson_plan" ? {
          sourceSelections: Object.entries(sourceSelections).map(([documentId, sectionIds]) => ({ documentId, sectionIds }))
        } : {})
      });
      setArtifacts((current) => mergeArtifactHistory(current, artifact));
      setSelectedId(artifact.id);
      setEditingId(artifact.id);
      setPrompt("");
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
  const missingApprovedCourseware = (app.appType === "courseware" || prerequisites.includes("approved_courseware")) && !sourceArtifactId;
  const missingLessonPlanSources = app.appType === "lesson_plan" && Object.keys(sourceSelections).length === 0;
  const generationBlocked = missingCourseContent || missingApprovedQuestions || missingApprovedCourseware || missingLessonPlanSources;
  const isEditing = Boolean(selected && editingId === selected.id);
  const hasPendingPublishedUpdate = Boolean(
    selected
    && selected.status === "PUBLISHED"
    && publishableAppTypes.has(selected.appType)
    && selected.publishedPayload != null
    && selected.payload !== selected.publishedPayload
  );
  const canEditSelected = Boolean(
    selected
    && selected.payload
    && ["DRAFT", "APPROVED", "PUBLISHED"].includes(selected.status)
    && selected.appType !== "html_courseware"
  );
  const selectedCoursewareSource = coursewareSources.find((source) => source.id === sourceArtifactId);
  const usesTopSave = Boolean(selected && topSaveAppTypes.has(selected.appType));
  const artifactFormId = selected ? `artifact-editor-${selected.id}` : undefined;
  const pptSlides = selected?.appType === "ppt_courseware" && payload && "slides" in payload ? payload.slides : [];
  const pptSource = selected ? coursewareSources.find((source) => source.id === selected.sourceArtifactId) : undefined;
  const pptSourceLabel = pptSource ? `${pptSource.title} · v${pptSource.version}` : undefined;

  function cancelEditing() {
    // Discard unsaved edits; remounting the editor (via its key) restores the
    // last server-saved content and returns to the read-only view.
    setEditingId("");
    setEditorDirty(false);
    setSavedNotice(false);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {app.appType === "html_courseware" ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            HTML 互动课件已停止生成。这里仅保留历史内容查看，请改用 PPT 课件。
          </p>
        ) : null}
        <form onSubmit={submit} className={app.appType === "html_courseware" ? "hidden" : "space-y-4"}>
          {!(["lesson_plan", "courseware", "ppt_courseware"] as CourseAiAppType[]).includes(app.appType) ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>内容范围</span>
              <select value={options.chapterId} onChange={(event) => updateOption("chapterId", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400">
                <option value="">全课程</option>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700"><span>难度</span><select value={options.difficulty} onChange={(event) => updateOption("difficulty", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>基础</option><option>提高</option><option>综合</option><option>挑战</option></select></label>
          </div> : null}

          {app.appType === "lesson_plan" ? <fieldset className="space-y-3"><legend className="text-sm font-medium text-slate-700">资料与章节来源</legend>{documentSources.map((document) => {
            const selected = sourceSelections[document.id];
            const allIds = document.sections.map((section) => section.id);
            const isExpanded = expandedDocumentIds.has(document.id);
            const panelId = `lesson-source-${document.id}`;
            const summary = selected === undefined ? "未选择" : selected.length === 0 ? "已选择整份资料" : `已选择 ${selected.length} 个章节`;
            return <div key={document.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input type="checkbox" checked={selected !== undefined && selected.length === 0} ref={(node) => { if (node) node.indeterminate = Boolean(selected?.length); }} onChange={() => toggleDocument(document.id)} /><span>{document.title}</span></label><button type="button" onClick={() => toggleDocumentExpanded(document.id)} aria-expanded={isExpanded} aria-controls={panelId} className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600">{isExpanded ? "收起" : "展开"}{isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}</button></div>{isExpanded ? <div id={panelId} className="ml-6 mt-2 space-y-2">{document.sections.map((section) => <label key={section.id} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={selected !== undefined && (selected.length === 0 || selected.includes(section.id))} onChange={() => toggleDocumentSection(document.id, section.id, allIds)} /><span>{section.title}</span></label>)}</div> : <p className="ml-6 mt-1 text-xs text-slate-500">{summary}</p>}</div>;
          })}{!documentSources.length ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">暂无解析成功的课程资料，请先导入并保存课程目录。</p> : null}{missingLessonPlanSources && documentSources.length ? <p className="text-xs text-amber-700">请选择整份资料或资料内具体章节。</p> : null}</fieldset> : null}

          {app.appType === "question_generation" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>题型</span><select value={options.questionType} onChange={(event) => updateOption("questionType", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>混合</option><option>单选</option><option>多选</option><option>简答</option></select></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>题量</span><input type="number" min={3} max={12} value={options.questionCount} onChange={(event) => updateOption("questionCount", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label></div> : null}
          {app.appType === "lesson_plan" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>课时分钟</span><input type="number" min={30} max={180} value={options.lessonMinutes} onChange={(event) => updateOption("lessonMinutes", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>教法</span><select value={options.teachingMethod} onChange={(event) => updateOption("teachingMethod", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>讲授结合实践</option><option>任务驱动</option><option>案例研讨</option><option>翻转课堂</option></select></label></div> : null}
          {app.appType === "courseware" ? <div className="space-y-3">{sourceArtifactId ? <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm">{recommendationLoading ? <p className="flex items-center gap-2 text-blue-800"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />AI正在分析教案并推荐课件页数……</p> : recommendationError ? <div className="space-y-2 text-amber-800"><p>AI页数建议暂不可用，你仍可以手动填写页数。</p><button type="button" onClick={retrySlideRecommendation} className="font-medium text-blue-700 underline underline-offset-4">重新分析</button></div> : recommendedSlideCount !== null ? <div className="space-y-2 text-blue-900"><p className="font-medium">AI分析建议：{recommendedSlideCount}页</p>{recommendationReason ? <p className="text-xs leading-5 text-blue-800">原因：{recommendationReason}</p> : null}<button type="button" onClick={adoptRecommendedSlideCount} className="inline-flex items-center rounded-lg bg-[var(--cx-blue)] px-3 py-1.5 text-xs font-medium text-white">采用{recommendedSlideCount}页</button></div> : <button type="button" onClick={requestSlideRecommendation} className="inline-flex items-center gap-1.5 font-medium text-blue-700 underline underline-offset-4"><Sparkles className="h-4 w-4" aria-hidden="true" />让 AI 分析教案并推荐课件页数</button>}</div> : null}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="space-y-1 text-sm font-medium text-slate-700"><span>课件页数</span><input type="number" min={SLIDE_COUNT_MIN} max={SLIDE_COUNT_MAX} value={options.slideCount} onChange={(event) => { slideCountTouchedRef.current = true; setSlideCountTouched(true); updateOption("slideCount", Number(event.target.value)); }} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>风格</span><select value={options.coursewareStyle} onChange={(event) => updateOption("coursewareStyle", event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option>课堂讲授</option><option>案例分析</option><option>实训操作</option><option>复习总结</option></select></label></div></div> : null}
          {app.appType === "paper_assembly" ? <label className="space-y-1 text-sm font-medium text-slate-700"><span>试卷总分</span><input type="number" min={30} max={150} value={options.paperScore} onChange={(event) => updateOption("paperScore", Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" /></label> : null}
          {app.appType === "paper_assembly" ? <div className={`rounded-xl p-3 text-sm ${missingApprovedQuestions ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-700"}`}><p>已审核题目 {approvedQuestions.length} 道</p>{missingApprovedQuestions ? <div className="mt-2"><p>请先生成并审核至少 3 道题目。</p><div className="mt-3 flex flex-wrap gap-3"><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/ai-workbench/apps/question_generation`}>去 AI出题</Link><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/question-bank`}>审核题库</Link></div></div> : null}</div> : null}
          {app.appType === "courseware" || app.appType === "ppt_courseware" ? <div className="space-y-3"><div className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-800"><p className="font-medium">{app.appType === "courseware" ? "只从已确认教案生成 AI课件" : "将已确认 AI课件生成可编辑 PPT"}</p><p className="mt-1">系统固定记录来源版本，上游修改不会静默覆盖当前产物。</p></div><CollapsibleSourcePanel title={app.appType === "courseware" ? "来源教案" : "来源AI课件"} panelId="ai-source-panel" summary={<>当前：{selectedCoursewareSource ? `${selectedCoursewareSource.title} · v${selectedCoursewareSource.version}` : "尚未选择"}<span className="mt-0.5 block">点击展开选择来源{app.appType === "courseware" ? "教案" : "AI课件"}</span></>}><label className="space-y-1 text-sm font-medium text-slate-700"><span>{app.appType === "courseware" ? "来源教案" : "来源AI课件"}</span><select value={sourceArtifactId} onChange={(event) => setSourceArtifactId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"><option value="">请选择已确认{app.appType === "courseware" ? "教案" : "AI课件"}</option>{coursewareSources.map((source) => <option key={source.id} value={source.id}>{source.title} · v{source.version}</option>)}</select></label></CollapsibleSourcePanel>{missingApprovedCourseware ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">还没有可用的已确认{app.appType === "courseware" ? "教案" : "AI课件"}。</p> : null}</div> : null}

          {app.appType !== "ppt_courseware" ? <><div><label htmlFor="ai-app-prompt" className="text-sm font-medium text-slate-700">生成要求</label><textarea id="ai-app-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={`补充${app.title}要求`} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" /></div><div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-700">{structuredPrompt()}</div></> : null}
          {missingCourseContent ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">当前课程还没有可用于 AI 生成的内容</p><p className="mt-1 leading-5">先导入课程文档或添加课程资料，系统才知道应该依据什么生成。</p><div className="mt-3 flex flex-wrap gap-3"><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/ai-workbench/content`}>导入课程文档</Link><Link className="font-medium underline underline-offset-4" href={`/space/courses/${courseId}/resources`}>查看课程资料库</Link></div></div> : null}
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isBusy || generationBlocked}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : app.appType === "ppt_courseware" ? <Download className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {creating ? (app.appType === "ppt_courseware" ? "正在生成 PPT" : "正在创建 AI 任务") : (app.appType === "ppt_courseware" ? "生成PPT" : "开始 AI 生成")}
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
                  <button type="button" disabled={deletingId === artifact.id} onClick={() => removeArtifact(artifact)} className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${artifact.status === "PUBLISHED" && publishableAppTypes.has(artifact.appType) ? "text-slate-400" : "text-red-600"}`} title={artifact.status === "PUBLISHED" && publishableAppTypes.has(artifact.appType) ? "请先撤回再删除" : "删除"}>
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
        {!selected ? <div className="flex min-h-[360px] items-center justify-center"><div className="max-w-md text-center"><Sparkles className="mx-auto h-9 w-9 text-blue-500" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold text-slate-900">{app.appType === "html_courseware" ? "暂无历史 HTML 课件" : app.appType === "ppt_courseware" ? "选择已有 AI课件制作 PPT" : `准备开始${app.title}`}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{app.appType === "html_courseware" ? "HTML 互动课件已停止生成。这里仅保留已有内容查看，请使用 PPT 课件。" : app.appType === "ppt_courseware" ? "选择一份已确认或已发布的 AI课件，系统会生成可逐页预览的 PPT 版本，可下载并发布给学生；如需修改内容请回到 AI课件调整后重新生成。" : <>填写生成要求 → AI 生成草稿 → 编辑确认{publishableAppTypes.has(app.appType) ? " → 发布给学生" : ""}。生成完成后可在这里逐项编辑，不会直接发布。</>}</p></div></div> : (
          <>
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div><p className="text-sm text-slate-500">AI 产物</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.title}</h2></div>
              <div className="flex flex-wrap gap-2">
                {selected.status === "FAILED" ? <Button type="button" variant="secondary" disabled={isBusy} onClick={() => runAction("retry", () => retryCourseAiArtifact(courseId, selected.id))}>{busyAction === "retry" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}重试 AI 生成</Button> : null}
                {selected.appType === "ppt_courseware" && Boolean(selected.payload) ? <Button type="button" variant="secondary" disabled={exportingId === selected.id} onClick={() => exportArtifact(selected, { format: "PPTX", variant: "DEFAULT" })}><Download className="h-4 w-4" aria-hidden="true" />{exportingId === selected.id ? "导出中" : "下载PPT"}</Button> : null}
                {canEditSelected && !isEditing && selected.appType !== "ppt_courseware" ? <Button type="button" variant="secondary" disabled={isBusy} onClick={() => { setSavedNotice(false); setEditingId(selected.id); }}><Edit3 className="h-4 w-4" aria-hidden="true" />编辑</Button> : null}
                {savedNotice && !isEditing ? <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />已保存</span> : null}
                {usesTopSave && isEditing ? <><Button type="button" variant="secondary" disabled={isBusy} onClick={cancelEditing}>取消</Button><Button type="submit" form={artifactFormId} disabled={isBusy}>{busyAction === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}保存</Button></> : null}
                {selected.status === "DRAFT" && !isEditing ? <Button type="button" variant="secondary" disabled={!canConfirmAiArtifact(selected.status, editorDirty, isBusy)} onClick={() => {
                  if (!canConfirmAiArtifact(selected.status, editorDirty, isBusy)) return;
                  void (async () => {
                    const confirmed = await runAction("confirm", () => confirmCourseAiArtifact(courseId, selected.id, selected.lockVersion ?? 0));
                    if (confirmed && selected.appType === "lesson_plan") {
                      window.location.assign(`/space/courses/${courseId}/ai-workbench/apps/courseware?sourceArtifactId=${encodeURIComponent(selected.id)}`);
                    }
                  })();
                }}>{busyAction === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}确认内容</Button> : null}
                {["APPROVED", "PUBLISHED"].includes(selected.status) && selected.appType === "courseware" && !isEditing ? <Link href={`/space/courses/${courseId}/ai-workbench/apps/ppt_courseware?sourceArtifactId=${encodeURIComponent(selected.id)}`} className="inline-flex min-h-10 items-center rounded-xl bg-[var(--cx-blue)] px-4 text-sm font-medium text-white">生成PPT</Link> : null}
                {selected.status === "APPROVED" && publishableAppTypes.has(selected.appType) ? <Button type="button" disabled={isBusy || editorDirty} title={editorDirty ? "请先保存修改" : undefined} onClick={() => runAction("publish", () => publishCourseAiArtifact(courseId, selected.id, selected.lockVersion ?? 0))}>{busyAction === "publish" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}发布给学生</Button> : null}
                {hasPendingPublishedUpdate ? <Button type="button" disabled={isBusy || editorDirty} title={editorDirty ? "请先保存修改" : undefined} onClick={() => runAction("confirm-update", () => confirmCourseAiArtifactUpdate(courseId, selected.id, selected.lockVersion ?? 0))}>{busyAction === "confirm-update" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}更新发布</Button> : null}
                {selected.status === "PUBLISHED" && publishableAppTypes.has(selected.appType) ? <Button type="button" variant="secondary" disabled={isBusy || editorDirty} title={editorDirty ? "请先保存修改" : undefined} onClick={() => runAction("withdraw", () => withdrawCourseAiArtifact(courseId, selected.id, selected.lockVersion ?? 0))}>{busyAction === "withdraw" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}撤回</Button> : null}
              </div>
            </div>

            <div aria-live="polite" role="status" className={`mb-5 flex items-start gap-3 rounded-xl p-4 text-sm ${statusTone(selected.status)}`}>
              {isActiveAiArtifact(selected) ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
              <div><p className="font-medium">{getAiArtifactStatusText(selected)}</p>{hasPendingPublishedUpdate ? <p className="mt-1">学生仍在查看上一次发布内容，确认更新后才会替换。</p> : null}{pollError ? <p className="mt-1 text-amber-700">{pollError}</p> : null}{selected.status === "FAILED" ? <p className="mt-1">{selected.errorMessage ?? "AI 调用失败，请重试"}</p> : null}</div>
            </div>

            {selected.status === "DRAFT" ? <div className="mb-5"><ArtifactConfirmationNotice dirty={editorDirty} /></div> : null}

            <div className="max-h-[720px] overflow-y-auto pr-1">
              {selected.appType === "ppt_courseware" ? (
                <PptCoursewarePreview key={selected.id} title={selected.title} version={selected.version} slides={pptSlides} sourceLabel={pptSourceLabel} />
              ) : payload ? <AiArtifactEditor key={`${selected.id}-${isEditing ? "edit" : "read"}`} appType={selected.appType} title={selected.title} payload={payload} approvedQuestions={approvedQuestions} busy={busyAction === "save"} editable={isEditing} formId={artifactFormId} showFooterSave={!usesTopSave} onDirtyChange={setEditorDirty} onSave={async (body) => {
                const saved = await runAction("save", () => saveCourseAiArtifactRevision(courseId, selected.id, {
                  ...body,
                  lockVersion: selected.lockVersion ?? 0
                }));
                if (saved) {
                  setEditingId("");
                  setSavedNotice(true);
                }
              }} /> : selected.status === "FAILED" ? null : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">生成完成后可在此编辑和确认内容。</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
