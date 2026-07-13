"use client";

import React, { useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, MessageSquare, Plus, RefreshCw, Send, Square, Star, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { readAiStream, type AiStreamEvent } from "@/lib/ai/streamProtocol";
import type { AiCoachEvaluation, AiCoachRubricDimension } from "@/lib/courseWorkspace/aiCoach";

export type AiCoachTaskDto = {
  id: string;
  courseId: string;
  createdById: string | null;
  title: string;
  scenario: string;
  aiRole: string;
  objective: string;
  rubricDimensions: AiCoachRubricDimension[];
  completionCriteria: string;
  status: string;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiCoachMessageDto = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type AiCoachAttemptDto = {
  id: string;
  courseId: string;
  userId: string;
  kind: string;
  status: string;
  title: string | null;
  evaluation: AiCoachEvaluation | null;
  evaluationStatus: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  task: AiCoachTaskDto | null;
  messages: AiCoachMessageDto[];
  messageCount?: number;
  lastMessageRole?: string | null;
  detailsLoaded?: boolean;
};

type DialogueFailure = { attemptId: string; retryMessageId?: string; requestId?: string; message?: string; error: string };

type TaskDraft = {
  title: string;
  scenario: string;
  aiRole: string;
  objective: string;
  completionCriteria: string;
  rubricDimensions: AiCoachRubricDimension[];
};

const emptyTask: TaskDraft = {
  title: "",
  scenario: "",
  aiRole: "",
  objective: "",
  completionCriteria: "",
  rubricDimensions: [{ name: "", description: "", maxScore: 5 }]
};

function apiError(body: unknown, fallback: string) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function AiCoach({
  courseId,
  currentUserId,
  canManage,
  initialTasks,
  initialAttempts,
  initialNextCursor = null,
  initialDialogueFailure = null
}: {
  courseId: string;
  currentUserId: string;
  canManage: boolean;
  initialTasks: AiCoachTaskDto[];
  initialAttempts: AiCoachAttemptDto[];
  initialNextCursor?: string | null;
  initialDialogueFailure?: DialogueFailure | null;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [selectedAttemptId, setSelectedAttemptId] = useState(initialAttempts[0]?.id ?? "");
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTask);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [dialogueFailure, setDialogueFailure] = useState<DialogueFailure | null>(initialDialogueFailure);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const abortController = useRef<AbortController | null>(null);

  const selectedAttempt = useMemo(
    () => attempts.find((attempt) => attempt.id === selectedAttemptId) ?? attempts[0],
    [attempts, selectedAttemptId]
  );
  const latestStoredMessage = selectedAttempt?.messages.at(-1);
  const effectiveDialogueFailure = dialogueFailure?.attemptId === selectedAttempt?.id
    ? dialogueFailure
    : latestStoredMessage?.role === "USER"
      ? { attemptId: selectedAttempt!.id, retryMessageId: latestStoredMessage.id, error: "上一轮 AI 回复未完成，请重试该轮对话" }
      : null;

  function replaceAttempt(next: AiCoachAttemptDto) {
    setAttempts((current) => [{ ...next, detailsLoaded: true }, ...current.filter((attempt) => attempt.id !== next.id)]);
    setSelectedAttemptId(next.id);
  }

  async function selectAttempt(attempt: AiCoachAttemptDto) {
    setSelectedAttemptId(attempt.id);
    if (attempt.detailsLoaded) return;
    setBusy("detail");
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-coach/attempts/${attempt.id}`);
      const body = await response.json().catch(() => null) as { attempt?: AiCoachAttemptDto; error?: string } | null;
      if (!response.ok || !body?.attempt) throw new Error(apiError(body, "加载练习详情失败"));
      replaceAttempt(body.attempt);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "加载练习详情失败");
    } finally {
      setBusy("");
    }
  }

  async function loadMoreAttempts() {
    if (!nextCursor || lock.current) return;
    lock.current = true;
    setBusy("more");
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-coach/attempts?cursor=${encodeURIComponent(nextCursor)}`);
      const body = await response.json().catch(() => null) as {
        attempts?: AiCoachAttemptDto[];
        nextCursor?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !body?.attempts) throw new Error(apiError(body, "加载更多练习记录失败"));
      setAttempts((current) => [
        ...current,
        ...body.attempts!.filter((attempt) => !current.some((existing) => existing.id === attempt.id))
      ]);
      setNextCursor(body.nextCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载更多练习记录失败");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy("task");
    setError("");
    try {
      const response = await fetch(editingTaskId
        ? `/api/courses/${courseId}/ai-coach/tasks/${editingTaskId}`
        : `/api/courses/${courseId}/ai-coach/tasks`, {
        method: editingTaskId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskDraft)
      });
      const body = await response.json().catch(() => null) as { task?: AiCoachTaskDto; error?: string } | null;
      if (!response.ok || !body?.task) throw new Error(apiError(body, "保存陪练任务失败"));
      setTasks((current) => [body.task!, ...current.filter((task) => task.id !== body.task!.id)]);
      setTaskDraft(emptyTask);
      setEditingTaskId("");
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "保存陪练任务失败");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function changeTaskStatus(task: AiCoachTaskDto, status: "PUBLISHED" | "ARCHIVED") {
    if (lock.current) return;
    lock.current = true;
    setBusy(`task-${task.id}`);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-coach/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const body = await response.json().catch(() => null) as { task?: AiCoachTaskDto; error?: string } | null;
      if (!response.ok || !body?.task) throw new Error(apiError(body, "更新任务状态失败"));
      setTasks((current) => current.map((item) => item.id === body.task!.id ? body.task! : item));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新任务状态失败");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function startAttempt(taskId: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(`start-${taskId}`);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-coach/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId })
      });
      const body = await response.json().catch(() => null) as { attempt?: AiCoachAttemptDto; error?: string } | null;
      if (!response.ok || !body?.attempt) throw new Error(apiError(body, "创建练习失败"));
      replaceAttempt(body.attempt);
      setDialogueFailure(null);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "创建练习失败");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function sendMessage(retryMessageId?: string, requestIdOverride?: string, messageOverride?: string) {
    if (!selectedAttempt || lock.current || (!retryMessageId && !(messageOverride ?? input).trim())) return;
    const submitted = (messageOverride ?? input).trim();
    const requestId = retryMessageId ? "" : requestIdOverride ?? crypto.randomUUID();
    lock.current = true;
    setBusy("message");
    setError("");
    setDialogueFailure(null);
    setStreamingText("");
    const controller = new AbortController();
    abortController.current = controller;
    let persistedUserId = retryMessageId ?? "";
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-coach/attempts/${selectedAttempt.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryMessageId ? { retryMessageId } : { message: submitted, requestId }),
        signal: controller.signal
      });
      await readAiStream(response, (event: AiStreamEvent) => {
        if (event.type === "meta") {
          persistedUserId = event.userMessageId;
          if (!retryMessageId) {
            setInput("");
            setAttempts((current) => current.map((attempt) => attempt.id !== selectedAttempt.id ? attempt : {
              ...attempt,
              messages: attempt.messages.some((message) => message.id === event.userMessageId)
                ? attempt.messages
                : [...attempt.messages, { id: event.userMessageId, role: "USER", content: submitted, createdAt: new Date().toISOString() }]
            }));
          }
        } else if (event.type === "delta") {
          setStreamingText((current) => current + event.text);
        } else if (event.type === "done") {
          setAttempts((current) => current.map((attempt) => attempt.id !== selectedAttempt.id ? attempt : {
            ...attempt,
            messages: [...attempt.messages, {
              id: event.assistantMessage.id,
              role: "ASSISTANT",
              content: event.assistantMessage.content,
              createdAt: event.assistantMessage.createdAt
            }]
          }));
          setStreamingText("");
        } else {
          setStreamingText("");
          if (persistedUserId) setDialogueFailure({ attemptId: selectedAttempt.id, retryMessageId: persistedUserId, error: event.error });
          else setError(event.error);
        }
      });
    } catch (messageError) {
      setStreamingText("");
      const message = controller.signal.aborted ? "已停止生成，可重试本轮对话" : messageError instanceof Error ? messageError.message : "AI 调用失败，请重试";
      if (persistedUserId) setDialogueFailure({ attemptId: selectedAttempt.id, retryMessageId: persistedUserId, error: message });
      else setDialogueFailure({ attemptId: selectedAttempt.id, requestId, message: submitted, error: message });
    } finally {
      abortController.current = null;
      lock.current = false;
      setBusy("");
    }
  }

  async function evaluate() {
    if (!selectedAttempt || lock.current) return;
    lock.current = true;
    setBusy("evaluate");
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/ai-coach/attempts/${selectedAttempt.id}/evaluate`, { method: "POST" });
      const body = await response.json().catch(() => null) as { evaluation?: AiCoachEvaluation; completedAt?: string; error?: string } | null;
      if (!response.ok || !body?.evaluation) throw new Error(apiError(body, "生成评价失败，请重试"));
      setAttempts((current) => current.map((attempt) => attempt.id === selectedAttempt.id ? {
        ...attempt,
        status: "COMPLETED",
        evaluationStatus: "COMPLETED",
        evaluation: body.evaluation!,
        completedAt: body.completedAt ?? new Date().toISOString()
      } : attempt));
    } catch (evaluationError) {
      setAttempts((current) => current.map((attempt) => attempt.id === selectedAttempt.id ? { ...attempt, evaluationStatus: "FAILED" } : attempt));
      setError(evaluationError instanceof Error ? evaluationError.message : "生成评价失败，请重试");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <form onSubmit={saveTask} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5">
            <div><h2 className="font-semibold text-slate-900">{editingTaskId ? "编辑陪练任务" : "创建陪练任务"}</h2><p className="mt-1 text-sm text-slate-500">任务发布后配置和评价标准将锁定，保障学生练习口径不被改写。</p></div>
            <label className="block text-sm text-slate-700">任务名称<input required maxLength={200} value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3" /></label>
            <label className="block text-sm text-slate-700">场景<textarea required maxLength={4000} value={taskDraft.scenario} onChange={(event) => setTaskDraft((current) => ({ ...current, scenario: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label>
            <label className="block text-sm text-slate-700">AI 角色<textarea required maxLength={2000} value={taskDraft.aiRole} onChange={(event) => setTaskDraft((current) => ({ ...current, aiRole: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label>
            <label className="block text-sm text-slate-700">训练目标<textarea required maxLength={2000} value={taskDraft.objective} onChange={(event) => setTaskDraft((current) => ({ ...current, objective: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label>
            <label className="block text-sm text-slate-700">完成条件<textarea required maxLength={2000} value={taskDraft.completionCriteria} onChange={(event) => setTaskDraft((current) => ({ ...current, completionCriteria: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label>
            <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-800">评价维度</span><Button type="button" variant="secondary" onClick={() => setTaskDraft((current) => ({ ...current, rubricDimensions: [...current.rubricDimensions, { name: "", description: "", maxScore: 5 }] }))}><Plus className="h-4 w-4" />添加维度</Button></div>{taskDraft.rubricDimensions.map((dimension, index) => <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_2fr_90px]"><input required placeholder="维度名" value={dimension.name} onChange={(event) => setTaskDraft((current) => ({ ...current, rubricDimensions: current.rubricDimensions.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} className="h-10 rounded-lg border border-slate-200 px-3" /><input required placeholder="评价说明" value={dimension.description} onChange={(event) => setTaskDraft((current) => ({ ...current, rubricDimensions: current.rubricDimensions.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} className="h-10 rounded-lg border border-slate-200 px-3" /><input required type="number" min={1} max={100} value={dimension.maxScore} onChange={(event) => setTaskDraft((current) => ({ ...current, rubricDimensions: current.rubricDimensions.map((item, itemIndex) => itemIndex === index ? { ...item, maxScore: Number(event.target.value) } : item) }))} className="h-10 rounded-lg border border-slate-200 px-3" /></div>)}</div>
            <Button type="submit" disabled={busy === "task"}>{busy === "task" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{editingTaskId ? "保存修改" : "创建草稿"}</Button>
          </form>
          <aside className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-5"><h2 className="font-semibold text-slate-900">任务管理</h2>{tasks.map((task) => <div key={task.id} className="rounded-xl bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">v{task.version} · {task.status === "PUBLISHED" ? "已发布" : task.status === "ARCHIVED" ? "已归档" : "草稿"}</p></div><span className="text-xs text-slate-400">{task.rubricDimensions.length} 维度</span></div><div className="mt-3 flex flex-wrap gap-2">{task.status === "DRAFT" ? <><Button type="button" variant="secondary" onClick={() => { setEditingTaskId(task.id); setTaskDraft({ title: task.title, scenario: task.scenario, aiRole: task.aiRole, objective: task.objective, completionCriteria: task.completionCriteria, rubricDimensions: task.rubricDimensions }); }}>编辑</Button><Button type="button" disabled={busy === `task-${task.id}`} onClick={() => changeTaskStatus(task, "PUBLISHED")}>发布</Button></> : null}{task.status === "PUBLISHED" ? <Button type="button" variant="secondary" onClick={() => changeTaskStatus(task, "ARCHIVED")}>归档</Button> : null}</div></div>)}{!tasks.length ? <p className="text-sm text-slate-500">暂无陪练任务。</p> : null}</aside>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-100 bg-white p-5"><h2 className="font-semibold text-slate-900">开始新练习</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tasks.map((task) => <div key={task.id} className="rounded-xl bg-slate-50 p-4"><p className="font-medium text-slate-900">{task.title}</p><p className="mt-2 text-sm text-slate-600">{task.scenario}</p><p className="mt-2 text-xs text-slate-500">目标：{task.objective}</p><Button type="button" className="mt-4" disabled={busy === `start-${task.id}`} onClick={() => startAttempt(task.id)}>{busy === `start-${task.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}开始练习</Button></div>)}{!tasks.length ? <p className="text-sm text-slate-500">暂无已发布的陪练任务。</p> : null}</div></section>
      )}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><h2 className="font-semibold text-slate-900">{canManage ? "学生练习记录" : "我的练习记录"}</h2><div className="mt-4 space-y-2">{attempts.map((attempt) => <button key={attempt.id} type="button" onClick={() => selectAttempt(attempt)} className={`w-full rounded-xl px-3 py-3 text-left text-sm ${selectedAttempt?.id === attempt.id ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}><span className="block font-medium">{attempt.title}</span><span className="mt-1 block text-xs opacity-75">{canManage ? `学生 ${attempt.userId} · ` : ""}{attempt.status === "COMPLETED" ? "已完成" : "进行中"} · {attempt.messageCount ?? attempt.messages.length} 条消息</span></button>)}{!attempts.length ? <p className="text-sm text-slate-500">暂无练习记录。</p> : null}{nextCursor ? <Button type="button" variant="secondary" className="w-full" disabled={busy === "more"} onClick={loadMoreAttempts}>{busy === "more" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}加载更多记录</Button> : null}</div></aside>
        <section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><h2 className="font-semibold text-slate-900">真实多轮对话</h2><p className="mt-1 text-sm text-slate-500">{selectedAttempt?.task?.aiRole ?? "选择一条练习记录"}</p></div>{busy === "message" ? <Button type="button" variant="secondary" onClick={() => abortController.current?.abort()}><Square className="h-4 w-4" />停止生成</Button> : null}</div><div className="mt-5 min-h-64 space-y-4">{selectedAttempt?.messages.map((message) => { const student = message.role === "USER"; return <div key={message.id} className={`flex gap-3 ${student ? "justify-end" : "justify-start"}`}>{!student ? <UserRound className="mt-1 h-5 w-5 text-blue-600" /> : null}<div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${student ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700"}`}>{message.content}</div>{student ? <MessageSquare className="mt-1 h-5 w-5 text-blue-600" /> : null}</div>})}{streamingText ? <div className="flex gap-3"><Loader2 className="mt-1 h-5 w-5 animate-spin text-blue-600" /><div className="max-w-[80%] rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{streamingText}</div></div> : null}</div>{!canManage && selectedAttempt?.status !== "COMPLETED" ? <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">{effectiveDialogueFailure ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{effectiveDialogueFailure.error}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => effectiveDialogueFailure.retryMessageId ? sendMessage(effectiveDialogueFailure.retryMessageId) : sendMessage(undefined, effectiveDialogueFailure.requestId, effectiveDialogueFailure.message)}><RefreshCw className="h-4 w-4" />重试本轮对话</Button></div> : null}<div className="flex gap-2"><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="输入你的回答或追问" className="min-h-20 flex-1 rounded-xl border border-slate-200 p-3 text-sm" /><Button type="button" disabled={busy === "message" || !input.trim()} onClick={() => sendMessage()}><Send className="h-4 w-4" />发送</Button></div></div> : null}</section>
        <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-500" /><h2 className="font-semibold text-slate-900">评价结果</h2></div>{selectedAttempt?.evaluation ? <div className="mt-4 space-y-3"><p className="rounded-xl bg-white p-3 text-sm text-slate-700">总分 {selectedAttempt.evaluation.totalScore}/{selectedAttempt.evaluation.maxTotalScore}</p>{selectedAttempt.evaluation.dimensions.map((dimension) => <div key={dimension.name} className="rounded-xl bg-white p-3"><div className="flex justify-between text-sm font-medium"><span>{dimension.name}</span><span>{dimension.score}/{dimension.maxScore}</span></div><p className="mt-2 text-xs text-slate-500">证据：{dimension.evidence}</p><p className="mt-1 text-xs text-slate-600">{dimension.feedback}</p></div>)}<p className="text-sm text-slate-700">{selectedAttempt.evaluation.summary}</p></div> : <div className="mt-4 space-y-3"><p className="text-sm text-slate-500">完成对话后由 AI 严格按教师评价维度生成结果。</p>{!canManage && selectedAttempt?.messages.at(-1)?.role === "ASSISTANT" ? <Button type="button" disabled={busy === "evaluate" || busy === "message"} onClick={evaluate}>{busy === "evaluate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{selectedAttempt.evaluationStatus === "FAILED" ? "重试生成评价" : "结束并生成评价"}</Button> : null}</div>}</aside>
      </div>
    </div>
  );
}
