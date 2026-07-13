"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, LoaderCircle, Plus, RotateCcw, Send, Square } from "lucide-react";
import { readAiStream, type AiCitation, type AiStreamEvent } from "@/lib/ai/streamProtocol";

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
    <section className="overflow-hidden rounded-[28px] bg-white shadow-sm">
      <div className="grid min-h-[560px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-slate-100 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
          <button type="button" onClick={newConversation} disabled={streaming} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-medium text-white disabled:opacity-50">
            <Plus className="h-4 w-4" />新对话
          </button>
          <div className="mt-4 space-y-2">
            {conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => !streaming && setSelectedId(conversation.id)} className={`w-full rounded-xl px-3 py-3 text-left text-sm ${selectedId === conversation.id ? "bg-white font-medium text-blue-700 shadow-sm" : "text-slate-600"}`}>
                <span className="line-clamp-1">{conversation.title || "课程问答"}</span>
                <span className="mt-1 block text-xs font-normal text-slate-400">{conversation.messages.length} 条消息</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-slate-950">AI 助教</h2></div>
            <p className="mt-1 text-sm text-slate-500">仅依据《{courseTitle}》中你有权限查看的内容回答，并提供课程引用。</p>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {!displayedMessages.length && !streamText ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">输入课程问题开始对话。资料不足时，助教会明确说明。</p> : null}
            {displayedMessages.map((message) => {
              const assistant = message.role.toUpperCase() === "ASSISTANT";
              return <MessageBubble key={message.id} assistant={assistant} content={message.content} citations={message.citations} />;
            })}
            {streamText ? <MessageBubble assistant content={streamText} citations={streamCitations} streaming /> : null}
            {error ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p>AI 调用失败：{error}</p>
                {retryBody ? <button type="button" onClick={() => void send(retryBody)} disabled={streaming} className="mt-3 inline-flex items-center gap-1 font-medium"><RotateCcw className="h-4 w-4" />重试</button> : null}
              </div>
            ) : null}
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 p-2 focus-within:border-blue-400">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} disabled={streaming} maxLength={4_000} placeholder="询问当前课程内容" className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-60" />
              {streaming ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white"><Square className="h-4 w-4" />停止</button>
              ) : (
                <button type="button" onClick={submit} disabled={!draft.trim()} className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm text-white disabled:opacity-40"><Send className="h-4 w-4" />发送</button>
              )}
            </div>
            {streaming ? <p className="mt-2 flex items-center gap-2 text-xs text-blue-600"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />AI 正在基于课程资料回答</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ assistant, content, citations, streaming = false }: { assistant: boolean; content: string; citations: AiCitation[]; streaming?: boolean }) {
  return (
    <div className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${assistant ? "bg-slate-50 text-slate-700" : "bg-blue-600 text-white"}`}>
        <p className="whitespace-pre-wrap">{content}{streaming ? <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-blue-500 align-middle" /> : null}</p>
        {assistant && citations.length ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            {citations.map((citation, index) => <a key={citation.id} href={citation.href} className="rounded-full bg-white px-3 py-1 text-xs text-blue-700" title={citation.snippet}>[{index + 1}] {citation.label}</a>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
