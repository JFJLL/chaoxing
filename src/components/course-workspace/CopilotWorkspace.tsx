"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ChevronDown,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CopilotAssistantReply } from "@/components/course-workspace/CopilotMessage";
import { FilePicker } from "@/components/ui/FilePicker";
import { Input } from "@/components/ui/Input";
import { readAiStream, type AiStreamEvent } from "@/lib/ai/streamProtocol";
import {
  CourseDriveReferencePicker,
  type CourseDriveReferenceDto
} from "@/components/course-workspace/CourseDriveReferencePicker";

type SkillDto = {
  id: string;
  name: string;
  description: string;
  status: string;
  originalName?: string | null;
  fileSize?: number | null;
  instructions?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConversationDto = {
  id: string;
  title: string | null;
  status: string;
  activeSkill: { id: string; name: string; description: string; status: string } | null;
  attachments: CourseDriveReferenceDto[];
  messages: Array<{
    id: string;
    role: string;
    content: string;
    skillName: string | null;
    contextFiles: Array<{ id: string; name: string }>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type AnalyticsDto = {
  calls: number;
  activeUsers: number;
  success: number;
  failed: number;
  skills: Array<{ id: string; name: string; calls: number }>;
} | null;

type PendingUserMessage = {
  conversationId: string;
  content: string;
  skillName: string | null;
  contextFiles: Array<{ id: string; name: string }>;
};

type RootCandidateDto = { id: string; name: string; path: string };

function errorMessage(body: unknown, fallback: string) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function CopilotWorkspace({
  courseId,
  canManage,
  initialCopilotName,
  initialConversations,
  initialSkills,
  initialAnalytics,
  initialFolderId = null,
  initialFolders = [],
  canBindRoot = false
}: {
  courseId: string;
  canManage: boolean;
  initialCopilotName: string;
  initialConversations: ConversationDto[];
  initialSkills: SkillDto[];
  initialAnalytics: AnalyticsDto;
  initialFolderId?: string | null;
  initialFiles?: unknown[];
  initialFolders?: RootCandidateDto[];
  canBindRoot?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? null);
  const [skills, setSkills] = useState(initialSkills);
  const [copilotName, setCopilotName] = useState(initialCopilotName);
  const [copilotNameDraft, setCopilotNameDraft] = useState(initialCopilotName);
  const [folderId, setFolderId] = useState(initialFolderId);
  const [folderIdDraft, setFolderIdDraft] = useState(initialFolderId ?? "");
  const [rootFolders, setRootFolders] = useState(initialFolders);
  const [canBindRootState, setCanBindRootState] = useState(canBindRoot);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<PendingUserMessage | null>(null);
  const [retryMessageId, setRetryMessageId] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [selectedSkillFileName, setSelectedSkillFileName] = useState("");
  const skillInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowMessagesRef = useRef(true);

  const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId]);
  const selectableSkills = canManage ? skills : skills.filter((skill) => skill.status === "ENABLED");
  const selectedMessageCount = selected?.messages.length ?? 0;

  useEffect(() => {
    shouldFollowMessagesRef.current = true;
  }, [selectedId]);

  useEffect(() => {
    const region = messageScrollRef.current;
    if (!region || !shouldFollowMessagesRef.current) return;
    region.scrollTo({
      top: region.scrollHeight,
      behavior: "auto"
    });
  }, [pendingUserMessage?.conversationId, selectedId, selectedMessageCount, streamText, streaming]);

  useEffect(() => {
    const region = messageScrollRef.current;
    const content = region?.firstElementChild;
    if (!region || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (shouldFollowMessagesRef.current) region.scrollTo({ top: region.scrollHeight, behavior: "auto" });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [selectedId]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 128)}px`;
  }, [draft]);

  useEffect(() => {
    if (view !== "settings" || settingsLoaded) return;
    let cancelled = false;
    async function loadSettings() {
      try {
        const body = await api(`/api/courses/${courseId}/copilot/settings`, { cache: "no-store" });
        if (cancelled) return;
        setFolderId(body.folderId ?? null);
        setFolderIdDraft(body.folderId ?? "");
        setRootFolders(Array.isArray(body.folders) ? body.folders : []);
        setCanBindRootState(body.canBindRoot === true);
      } catch (error) {
        if (!cancelled) setStatus({ tone: "error", text: error instanceof Error ? error.message : "Copilot 设置加载失败" });
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    }
    void loadSettings();
    return () => { cancelled = true; };
  }, [courseId, settingsLoaded, view]);

  function replaceConversation(conversation: ConversationDto) {
    shouldFollowMessagesRef.current = true;
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setSelectedId(conversation.id);
  }

  async function api(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(body, "操作失败，请重试"));
    return body;
  }

  async function createConversation() {
    setBusy("conversation");
    setStatus(null);
    try {
      const body = await api(`/api/courses/${courseId}/copilot/conversations`, { method: "POST" });
      replaceConversation(body.conversation);
      return body.conversation as ConversationDto;
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "新建对话失败" });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function updateConversation(input: {
    title?: string;
    skillId?: string | null;
    references?: Array<{ driveFileId: string; referenceType: "FILE" | "FOLDER" }>;
  }, toast?: string, conversationId = selected?.id) {
    if (!conversationId) return null;
    setBusy("context");
    setStatus(null);
    try {
      const body = await api(`/api/courses/${courseId}/copilot/conversations/${conversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      replaceConversation(body.conversation);
      if (toast) setStatus({ tone: "success", text: toast });
      return body.conversation as ConversationDto;
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "更新对话失败" });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function chooseSkill(skillId: string, conversationId?: string) {
    const skill = skills.find((item) => item.id === skillId);
    await updateConversation({ skillId: skillId || null }, skill ? `已切换为「${skill.name}」，仅影响后续回复` : "已取消 Skill，仅影响后续回复", conversationId);
  }

  async function chooseSkillFromToolbar(skillId: string) {
    const conversation = selected ?? await createConversation();
    if (conversation) await chooseSkill(skillId, conversation.id);
  }

  async function applyReferences(references: Array<{ driveFileId: string; referenceType: "FILE" | "FOLDER" }>) {
    const conversation = selected ?? await createConversation();
    if (!conversation) return false;
    return Boolean(await updateConversation({ references }, "对话课程资料已更新", conversation.id));
  }

  async function removeFile(fileId: string | null) {
    if (!selected || !fileId) return;
    await updateConversation({
      references: selected.attachments.flatMap((item) => item.id && item.id !== fileId ? [{
        driveFileId: item.id,
        referenceType: item.referenceType
      }] : [])
    });
  }

  async function renameConversation(conversation: ConversationDto) {
    const title = window.prompt("重命名对话", conversation.title || "新对话")?.trim();
    if (!title) return;
    await updateConversation({ title }, undefined, conversation.id);
  }

  async function deleteConversation(conversation: ConversationDto) {
    if (!window.confirm(`删除对话「${conversation.title || "新对话"}」？此操作不可恢复。`)) return;
    setBusy("delete");
    try {
      await api(`/api/courses/${courseId}/copilot/conversations/${conversation.id}`, { method: "DELETE" });
      const next = conversations.filter((item) => item.id !== conversation.id);
      setConversations(next);
      if (selectedId === conversation.id) setSelectedId(next[0]?.id ?? null);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "删除对话失败" });
    } finally {
      setBusy("");
    }
  }

  async function send(retryMessageId?: string) {
    if (streaming) return;
    let conversation = selected;
    if (!conversation) conversation = await createConversation();
    const message = draft.trim();
    if (!conversation || (!retryMessageId && !message)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    shouldFollowMessagesRef.current = true;
    setStreaming(true);
    setRetryMessageId(retryMessageId ?? "");
    setStreamText("");
    setStatus(null);
    if (!retryMessageId) {
      setPendingUserMessage({
        conversationId: conversation.id,
        content: message,
        skillName: conversation.activeSkill?.name ?? null,
        contextFiles: conversation.attachments
          .filter((attachment) => attachment.id)
          .map((attachment) => ({ id: attachment.id!, name: attachment.name }))
      });
      setDraft("");
    }
    let userMessageId = retryMessageId ?? "";
    try {
      const body = retryMessageId ? { retryMessageId } : { message, requestId: crypto.randomUUID() };
      const response = await fetch(`/api/courses/${courseId}/copilot/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      await readAiStream(response, (event: AiStreamEvent) => {
        if (event.type === "meta") {
          userMessageId = event.userMessageId;
          setRetryMessageId(event.userMessageId);
          if (!retryMessageId) {
            setPendingUserMessage(null);
            setConversations((current) => current.map((item) => item.id !== conversation!.id ? item : {
              ...item,
              title: item.messages.some((stored) => stored.role === "USER") ? item.title : message.slice(0, 40),
              messages: item.messages.some((stored) => stored.id === event.userMessageId) ? item.messages : [...item.messages, {
                id: event.userMessageId,
                role: "USER",
                content: message,
                skillName: item.activeSkill?.name ?? null,
                contextFiles: item.attachments.filter((attachment) => attachment.id).map((attachment) => ({ id: attachment.id!, name: attachment.name })),
                createdAt: new Date().toISOString()
              }]
            }));
          }
        } else if (event.type === "delta") {
          setStreamText((current) => current + event.text);
        } else if (event.type === "done") {
          setPendingUserMessage(null);
          setConversations((current) => {
            const item = current.find((stored) => stored.id === conversation!.id);
            if (!item) return current;
            const updated = {
              ...item,
              messages: item.messages.some((stored) => stored.id === event.assistantMessage.id) ? item.messages : [...item.messages, {
                id: event.assistantMessage.id,
                role: "ASSISTANT",
                content: event.assistantMessage.content,
                skillName: null,
                contextFiles: [],
                createdAt: event.assistantMessage.createdAt
              }],
              updatedAt: event.assistantMessage.createdAt
            };
            return [updated, ...current.filter((stored) => stored.id !== item.id)];
          });
          setStreamText("");
          setRetryMessageId("");
        } else {
          setStatus({ tone: "error", text: event.error });
        }
      });
    } catch (error) {
      setStatus({ tone: "error", text: controller.signal.aborted ? (userMessageId ? "已停止生成，可重试上一条问题" : "已停止生成，问题已保留") : error instanceof Error ? error.message : "Copilot 调用失败" });
      if (!userMessageId && !retryMessageId) setDraft((current) => current || message);
    } finally {
      abortRef.current = null;
      setPendingUserMessage(null);
      setStreaming(false);
      if (!userMessageId && !retryMessageId) setStreamText("");
    }
  }

  async function saveCopilotName() {
    const name = copilotNameDraft.trim();
    if (!name || name === copilotName) return;
    setBusy("copilot-name");
    setStatus(null);
    try {
      const body = await api(`/api/courses/${courseId}/copilot/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copilotName: name })
      });
      setCopilotName(body.copilotName);
      setCopilotNameDraft(body.copilotName);
      setStatus({ tone: "success", text: `名称已修改为「${body.copilotName}」，学生端将同步显示` });
      router.refresh();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Copilot 名称保存失败" });
    } finally {
      setBusy("");
    }
  }

  async function saveCourseDriveRoot() {
    if (!canBindRootState || !folderIdDraft || folderIdDraft === folderId) return;
    setBusy("drive-root");
    setStatus(null);
    try {
      const body = await api(`/api/courses/${courseId}/copilot/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderIdDraft })
      });
      setFolderId(body.folderId);
      setFolderIdDraft(body.folderId);
      setStatus({ tone: "success", text: "课程云盘根目录已更新" });
      router.refresh();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "课程云盘根目录更新失败" });
    } finally {
      setBusy("");
    }
  }

  async function uploadSkill(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy("skill-upload");
    try {
      const body = await api(`/api/courses/${courseId}/copilot/skills`, { method: "POST", body: formData });
      setSkills((current) => [body.skill, ...current]);
      setStatus({ tone: "success", text: `Skill「${body.skill.name}」已上传，测试后可启用` });
      setSelectedSkillFileName("");
      if (skillInputRef.current) skillInputRef.current.value = "";
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Skill 上传失败" });
    } finally {
      setBusy("");
    }
  }

  async function changeSkillStatus(skill: SkillDto) {
    setBusy(`skill-${skill.id}`);
    try {
      const next = skill.status === "ENABLED" ? "DISABLED" : "ENABLED";
      const body = await api(`/api/courses/${courseId}/copilot/skills/${skill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, status: body.skill.status } : item));
      if (next === "DISABLED") setConversations((current) => current.map((item) => item.activeSkill?.id === skill.id ? { ...item, activeSkill: null } : item));
      setStatus({ tone: "success", text: next === "ENABLED" ? "Skill 已对学生启用" : "Skill 已停用" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Skill 状态更新失败" });
    } finally {
      setBusy("");
    }
  }

  async function deleteSkill(skill: SkillDto) {
    if (!window.confirm(`删除 Skill「${skill.name}」？`)) return;
    setBusy(`skill-${skill.id}`);
    try {
      await api(`/api/courses/${courseId}/copilot/skills/${skill.id}`, { method: "DELETE" });
      setSkills((current) => current.filter((item) => item.id !== skill.id));
      setStatus({ tone: "success", text: "Skill 已删除" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Skill 删除失败" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => setView("chat")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "chat" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}><Sparkles className="mr-2 inline h-4 w-4" />测试 Copilot</button>
          <button type="button" onClick={() => setView("settings")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "settings" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}><Settings2 className="mr-2 inline h-4 w-4" />Copilot 设置</button>
        </div>
      ) : null}
      {status ? <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${status.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}><span>{status.text}</span>{status.tone === "error" && retryMessageId && !streaming ? <Button type="button" variant="secondary" className="h-8" onClick={() => void send(retryMessageId)}>重试上一条</Button> : null}</div> : null}

      {view === "chat" ? (
        <div className="grid h-[calc(100dvh-330px)] min-h-[560px] max-h-[780px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="flex min-h-0 max-h-44 flex-col border-b border-slate-100 bg-slate-50 p-4 lg:max-h-none lg:border-b-0 lg:border-r">
            <Button className="w-full" onClick={() => void createConversation()} disabled={busy === "conversation" || streaming}><MessageSquarePlus className="h-4 w-4" />新对话</Button>
            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={`group flex items-center rounded-xl ${selectedId === conversation.id ? "bg-white shadow-sm" : "hover:bg-white/70"}`}>
                  <button type="button" onClick={() => { if (!streaming) { shouldFollowMessagesRef.current = true; setSelectedId(conversation.id); setRetryMessageId(""); } }} className="min-w-0 flex-1 px-3 py-3 text-left">
                    <span className="block truncate text-sm font-medium text-slate-800">{conversation.title || "新对话"}</span>
                    <span className="mt-1 block text-xs text-slate-400">{conversation.messages.length} 条消息</span>
                  </button>
                  <button type="button" aria-label="重命名对话" onClick={() => void renameConversation(conversation)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="删除对话" onClick={() => void deleteConversation(conversation)} className="mr-2 p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {!conversations.length ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">创建一个私密对话开始使用。</p> : null}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="shrink-0 border-b border-slate-100 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative">
                  <span className="sr-only">选择 Skill</span>
                  <select value={selected?.activeSkill?.id ?? ""} onChange={(event) => void chooseSkillFromToolbar(event.target.value)} disabled={streaming || busy === "context" || busy === "conversation"} className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400">
                    <option value="">未选择 Skill</option>
                    {selectableSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}{canManage && skill.status !== "ENABLED" ? "（未启用）" : ""}</option>)}
                  </select>
                  <Sparkles className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-blue-600" />
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                </label>
                <CourseDriveReferencePicker
                  courseId={courseId}
                  selected={selected?.attachments ?? []}
                  disabled={streaming || busy === "context" || busy === "conversation"}
                  canUpload={canManage}
                  onApply={applyReferences}
                />
                <div className="text-xs leading-5 text-slate-400 lg:ml-auto lg:text-right">
                  <span className="block">对话仅你可见 · 每天最多 100 次</span>
                  <span className="block">当前 Skill、文件和最近对话会用于后续回复</span>
                </div>
              </div>
              {selected?.attachments.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.attachments.map((attachment) => (
                    <span key={attachment.id ?? attachment.name} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${attachment.available ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
                      {attachment.referenceType === "FOLDER" ? <Folder className="h-3.5 w-3.5" /> : attachment.mimeType?.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}{attachment.name}
                      <button type="button" aria-label={`移除 ${attachment.name}`} disabled={streaming || busy === "context"} onClick={() => void removeFile(attachment.id)}><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              ref={messageScrollRef}
              data-copilot-scroll-region="true"
              aria-label="对话消息"
              onScroll={(event) => {
                const region = event.currentTarget;
                shouldFollowMessagesRef.current = region.scrollHeight - region.scrollTop - region.clientHeight < 120;
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
            >
              <div className="space-y-6">
                {selected?.messages.map((message) => message.role === "USER" ? (
                  <div key={message.id} className="mx-auto flex w-full max-w-3xl justify-end">
                    <article className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-white shadow-sm sm:max-w-[78%]">
                      {message.skillName || message.contextFiles.length ? <p className="mb-2 text-xs text-blue-100">{message.skillName ? `Skill：${message.skillName}` : ""}{message.skillName && message.contextFiles.length ? " · " : ""}{message.contextFiles.length ? "已使用课程资料" : ""}</p> : null}
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
                    </article>
                  </div>
                ) : <CopilotAssistantReply key={message.id} content={message.content} />)}
                {pendingUserMessage && pendingUserMessage.conversationId === selected?.id ? (
                  <div className="mx-auto flex w-full max-w-3xl justify-end">
                    <article className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-white shadow-sm sm:max-w-[78%]">
                      {pendingUserMessage.skillName || pendingUserMessage.contextFiles.length ? <p className="mb-2 text-xs text-blue-100">{pendingUserMessage.skillName ? `Skill：${pendingUserMessage.skillName}` : ""}{pendingUserMessage.skillName && pendingUserMessage.contextFiles.length ? " · " : ""}{pendingUserMessage.contextFiles.length ? "已使用课程资料" : ""}</p> : null}
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">{pendingUserMessage.content}</p>
                    </article>
                  </div>
                ) : null}
                {streaming ? <CopilotAssistantReply content={streamText} pending /> : null}
                {!selected?.messages.length && !pendingUserMessage && !streaming ? <div className="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50"><Bot className="h-6 w-6 text-blue-600" /></span><h2 className="mt-4 font-semibold text-slate-900">开始使用{copilotName}</h2><p className="mt-2 text-sm leading-6 text-slate-500">直接提问即可开始；需要特定方法时选择 Skill，需要结合课程材料时添加文件。</p></div> : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
              <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50">
                <textarea
                  ref={composerRef}
                  value={draft}
                  rows={1}
                  maxLength={4_000}
                  aria-label="输入 Copilot 问题"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
                  placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                  className="max-h-32 min-h-12 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 text-sm leading-6 outline-none placeholder:text-slate-400"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">AI 生成内容仅供参考 · 最多 4000 字</span>
                  {streaming ? <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}><Loader2 className="h-4 w-4 animate-spin" />停止生成</Button> : <Button type="button" onClick={() => void send()} disabled={!draft.trim()}><Send className="h-4 w-4" />发送</Button>}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Copilot 名称</h2>
            <p className="mt-1 text-sm text-slate-500">学生会在上课入口和对话页看到这个名称。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input aria-label="Copilot 名称" value={copilotNameDraft} maxLength={40} onChange={(event) => setCopilotNameDraft(event.target.value)} />
              <Button onClick={() => void saveCopilotName()} disabled={busy === "copilot-name" || !copilotNameDraft.trim() || copilotNameDraft.trim() === copilotName}>
                {busy === "copilot-name" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}保存名称
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="font-semibold text-slate-900">课程云盘根目录</h2>
            <p className="mt-1 text-sm text-slate-500">
              {!settingsLoaded
                ? "正在读取当前绑定状态。"
                : folderId
                  ? "当前课程云盘已绑定。"
                  : "当前课程云盘尚未绑定。"}
              {settingsLoaded
                ? canBindRootState
                  ? " 只有课程所有者或管理员可以修改存储边界。"
                  : " 如需变更，请联系课程所有者。"
                : null}
            </p>
            {settingsLoaded && canBindRootState ? (
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  aria-label="课程云盘根目录"
                  value={folderIdDraft}
                  onChange={(event) => setFolderIdDraft(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value="">请选择文件夹</option>
                  {rootFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
                </select>
                <Button onClick={() => void saveCourseDriveRoot()} disabled={busy === "drive-root" || !folderIdDraft || folderIdDraft === folderId}>
                  {busy === "drive-root" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {folderId ? "重新绑定" : "绑定根目录"}
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="font-semibold text-slate-900">课程 Skill</h2><p className="mt-1 text-sm text-slate-500">支持 Markdown 和 ZIP，最大 10MB；上传后先测试，再启用给学生。</p>
            <form action={uploadSkill} className="mt-4 grid gap-3 rounded-2xl border border-[var(--cx-border)] bg-slate-50/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <FilePicker
                ref={skillInputRef}
                id="copilot-skill-upload"
                name="file"
                accept=".md,.zip"
                required
                label="选择 Skill 文件"
                hint="Markdown 或 ZIP，最大 10MB"
                selectedFileName={selectedSkillFileName}
                onChange={(event) => setSelectedSkillFileName(event.target.files?.[0]?.name ?? "")}
              />
              <Button type="submit" className="w-full sm:w-auto" disabled={busy === "skill-upload" || !selectedSkillFileName}>
                {busy === "skill-upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {busy === "skill-upload" ? "上传中" : "上传 Skill"}
              </Button>
            </form>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {skills.map((skill) => <article key={skill.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-slate-900">{skill.name}</h3><p className="mt-1 text-sm text-slate-500">{skill.description}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${skill.status === "ENABLED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{skill.status === "ENABLED" ? "已启用" : "待启用"}</span></div>{skill.instructions ? <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-blue-600">预览完整指令</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{skill.instructions}</pre></details> : null}<div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => { setView("chat"); if (!selected) { void createConversation().then((conversation) => conversation && void chooseSkill(skill.id, conversation.id)); } else { void chooseSkill(skill.id, selected.id); } }}><Sparkles className="h-4 w-4" />测试</Button><Button variant="secondary" disabled={busy === `skill-${skill.id}`} onClick={() => void changeSkillStatus(skill)}>{skill.status === "ENABLED" ? "停用" : "启用"}</Button><Button variant="danger" disabled={skill.status !== "DISABLED" || busy === `skill-${skill.id}`} onClick={() => void deleteSkill(skill)}><Trash2 className="h-4 w-4" />删除</Button></div></article>)}
              {!skills.length ? <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">还没有 Skill。</p> : null}
            </div>
          </section>

          {initialAnalytics ? <section className="rounded-2xl border border-slate-100 bg-white p-5"><h2 className="font-semibold text-slate-900">近 7 日匿名使用情况</h2><div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="调用次数" value={initialAnalytics.calls} /><Metric label="活跃学生" value={initialAnalytics.activeUsers} /><Metric label="成功" value={initialAnalytics.success} /><Metric label="失败" value={initialAnalytics.failed} /></div>{initialAnalytics.skills.length ? <div className="mt-4 flex flex-wrap gap-2">{initialAnalytics.skills.map((skill) => <span key={skill.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{skill.name} · {skill.calls} 次</span>)}</div> : null}</section> : null}
        </div>
      )}

    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>;
}
