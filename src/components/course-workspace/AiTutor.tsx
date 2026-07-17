"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, LoaderCircle, Plus, RotateCcw, Send, Square } from "lucide-react";
import Link from "next/link";
import { readAiStream, type AiCitation, type AiStreamEvent } from "@/lib/ai/streamProtocol";
import { CopilotMarkdown } from "@/components/course-workspace/CopilotMessage";

export type TutorMessageDto = {
  id: string;
  role: string;
  content: string;
  citations: AiCitation[];
  createdAt: string;
};

export type TutorConversationDto = {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: TutorMessageDto[];
};

type RetryBody = { message: string; requestId: string } | { retryMessageId: string };

function safeError(error: unknown) {
  return error instanceof Error && error.message ? error.message : "AI 调用失败，请重试";
}

async function parseCreatedConversation(response: Response): Promise<TutorConversationDto> {
  const body = await response.json().catch(() => null) as { conversation?: TutorConversationDto; error?: string } | null;
  if (!response.ok || !body?.conversation?.id) throw new Error(body?.error || "新建对话失败，请重试");
  return body.conversation;
}

export function AiTutor({
  courseId,
  courseTitle,
  initialConversations
}: {
  courseId: string;
  courseTitle: string;
  initialConversations: TutorConversationDto[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamCitations, setStreamCitations] = useState<AiCitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryBody, setRetryBody] = useState<RetryBody | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const updateConversation = (id: string, updater: (conversation: TutorConversationDto) => TutorConversationDto) => {
    setConversations((current) => current.map((conversation) => conversation.id === id ? updater(conversation) : conversation));
  };

  async function createConversation() {
    const response = await fetch(`/api/courses/${courseId}/ai-tutor/conversations`, { method: "POST" });
    const conversation = await parseCreatedConversation(response);
    setConversations((current) => [conversation, ...current]);
    setSelectedId(conversation.id);
    return conversation;
  }

  async function newConversation() {
    if (streaming) return;
    setError(null);
    try {
      await createConversation();
    } catch (cause) {
      setError(safeError(cause));
    }
  }

  async function send(body: RetryBody) {
    if (streaming) return;
    setError(null);
    setStreamText("");
    setStreamCitations([]);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    let conversation = selected;
    let optimisticId: string | null = null;
    let receivedMeta = false;
    let retryForTurn: RetryBody = body;

    try {
      if (!conversation) conversation = await createConversation();
      const conversationId = conversation.id;
      if ("message" in body) {
        optimisticId = body.requestId;
        const pending: TutorMessageDto = {
          id: optimisticId,
          role: "USER",
          content: body.message,
          citations: [],
          createdAt: new Date().toISOString()
        };
        updateConversation(conversationId, (item) => ({ ...item, messages: [...item.messages, pending] }));
      }

      const response = await fetch(`/api/courses/${courseId}/ai-tutor/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      await readAiStream(response, (event: AiStreamEvent) => {
        if (event.type === "meta") {
          receivedMeta = true;
          retryForTurn = { retryMessageId: event.userMessageId };
          setStreamCitations(event.citations);
          setRetryBody(retryForTurn);
          if ("message" in body) setDraft("");
          if (optimisticId) {
            updateConversation(conversationId, (item) => ({
              ...item,
              messages: item.messages.map((message) => message.id === optimisticId
                ? { ...message, id: event.userMessageId }
                : message)
            }));
          }
        } else if (event.type === "delta") {
          setStreamText((current) => current + event.text);
        } else if (event.type === "done") {
          updateConversation(conversationId, (item) => ({
            ...item,
            messages: [...item.messages, { ...event.assistantMessage, role: "ASSISTANT" }],
            updatedAt: event.assistantMessage.createdAt
          }));
          setStreamText("");
          setStreamCitations([]);
          setRetryBody(null);
        } else {
          setStreamText("");
          setError(event.error);
        }
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        setError("已停止生成，可以重试上一条问题");
      } else {
        setError(safeError(cause));
      }
      setRetryBody(retryForTurn);
      if (!receivedMeta && optimisticId && conversation) {
        updateConversation(conversation.id, (item) => ({
          ...item,
          messages: item.messages.filter((message) => message.id !== optimisticId)
        }));
      }
      setStreamText("");
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  const submit = () => {
    const message = draft.trim();
    if (message) void send({ message, requestId: crypto.randomUUID() });
  };

  const displayedMessages = selected?.messages ?? [];

  return (
    <section className="overflow-hidden rounded-3xl border border-white/80 bg-white shadow-panel">
      <div className="grid min-h-[520px] lg:min-h-[560px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-slate-100 bg-slate-50/80 p-3 sm:p-4 lg:border-b-0 lg:border-r">
          <button type="button" onClick={newConversation} disabled={streaming} className="cx-focus-ring cx-tactile flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cx-blue)] text-sm font-medium text-white shadow-sm hover:bg-[var(--cx-blue-dark)] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" />新对话
          </button>
          <div role="group" aria-label="历史对话" className="cx-hide-scrollbar mt-3 flex gap-2 overflow-x-auto lg:mt-4 lg:block lg:space-y-2 lg:overflow-visible">
            {conversations.map((conversation) => (
              <button key={conversation.id} type="button" aria-pressed={selectedId === conversation.id} onClick={() => !streaming && setSelectedId(conversation.id)} className={`cx-focus-ring cx-tactile w-44 shrink-0 rounded-xl border px-3 py-3 text-left text-sm lg:w-full ${selectedId === conversation.id ? "border-indigo-100 bg-white font-medium text-[var(--cx-blue)] shadow-sm" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/70"}`}>
                <span className="line-clamp-1">{conversation.title || "课程问答"}</span>
                <span className="mt-1 block text-xs font-normal text-slate-400">{conversation.messages.length} 条消息</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-slate-100 bg-white/80 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" aria-hidden="true" /><Bot className="h-5 w-5 text-[var(--cx-blue)]" aria-hidden="true" /><h2 className="font-semibold text-slate-950">AI 助教</h2></div>
            <p className="mt-1 text-sm text-slate-500">仅依据《{courseTitle}》中你有权限查看的内容回答，并提供课程引用。</p>
          </header>
          <div role="log" aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {!displayedMessages.length && !streamText ? <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-500"><p className="font-medium text-slate-700">从当前课程开始提问</p><p className="mt-1">输入课程问题开始对话。资料不足时，助教会明确说明。</p></div> : null}
            {displayedMessages.map((message) => {
              const assistant = message.role.toUpperCase() === "ASSISTANT";
              return <MessageBubble key={message.id} assistant={assistant} content={message.content} citations={message.citations} />;
            })}
            {streamText ? <MessageBubble assistant content={streamText} citations={streamCitations} streaming /> : null}
            {error ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p>AI 调用失败：{error}</p>
                {retryBody ? <button type="button" onClick={() => void send(retryBody)} disabled={streaming} className="cx-focus-ring cx-tactile mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-red-100"><RotateCcw className="h-4 w-4" />重试</button> : null}
              </div>
            ) : null}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/40 p-3 sm:p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-[var(--cx-border-strong)] bg-white p-2 shadow-sm transition focus-within:border-[var(--cx-blue)] focus-within:ring-4 focus-within:ring-[var(--cx-focus)]">
              <textarea aria-label="课程问题" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} disabled={streaming} maxLength={4_000} placeholder="询问当前课程内容" className="min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-60" />
              {streaming ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="cx-focus-ring cx-tactile flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white shadow-sm hover:bg-slate-800"><Square className="h-4 w-4" />停止</button>
              ) : (
                <button type="button" onClick={submit} disabled={!draft.trim()} className="cx-focus-ring cx-tactile flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[var(--cx-blue)] px-3 text-sm text-white shadow-sm hover:bg-[var(--cx-blue-dark)] disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" />发送</button>
              )}
            </div>
            {streaming ? <p aria-live="polite" className="mt-2 flex items-center gap-2 text-xs text-[var(--cx-blue)]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />AI 正在基于课程资料回答</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ assistant, content, citations, streaming = false }: { assistant: boolean; content: string; citations: AiCitation[]; streaming?: boolean }) {
  return (
    <div className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
      <div aria-busy={streaming || undefined} className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[86%] ${assistant ? "rounded-tl-md border border-slate-100 bg-slate-50 text-slate-700" : "rounded-tr-md bg-[var(--cx-blue)] text-white shadow-sm"}`}>
        {assistant ? <CopilotMarkdown content={content} /> : <p className="whitespace-pre-wrap">{content}</p>}
        {streaming ? <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-blue-500 align-middle" aria-label="正在生成" /> : null}
        {assistant && citations.length ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            {citations.map((citation, index) => <Link key={citation.id} href={citation.href} className="cx-focus-ring cx-tactile rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-[var(--cx-blue)] shadow-sm hover:border-indigo-200 hover:bg-[var(--cx-blue-soft)]" title={citation.snippet}>[{index + 1}] {citation.label}</Link>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
