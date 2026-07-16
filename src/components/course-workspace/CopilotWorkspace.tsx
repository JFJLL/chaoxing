"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { readAiStream, type AiStreamEvent } from "@/lib/ai/streamProtocol";

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

type FileDto = {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  size: number;
  contextKind: "document" | "image" | "unsupported";
  contextReady: boolean;
  contextSelectable: boolean;
  extractionStatus: string;
  extractionError: string | null;
};

type ConversationDto = {
  id: string;
  title: string | null;
  status: string;
  activeSkill: { id: string; name: string; description: string; status: string } | null;
  attachments: Array<{ id: string | null; name: string; mimeType: string | null; available: boolean }>;
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

type FolderDto = {
  id: string;
  name: string;
  path: string;
  boundCourses: Array<{ id: string; title: string }>;
};

type AnalyticsDto = {
  calls: number;
  activeUsers: number;
  success: number;
  failed: number;
  skills: Array<{ id: string; name: string; calls: number }>;
} | null;

function errorMessage(body: unknown, fallback: string) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function CopilotWorkspace({
  courseId,
  canManage,
  initialFolderId,
  initialConversations,
  initialSkills,
  initialFiles,
  initialFolders,
  initialAnalytics
}: {
  courseId: string;
  canManage: boolean;
  initialFolderId: string | null;
  initialConversations: ConversationDto[];
  initialSkills: SkillDto[];
  initialFiles: FileDto[];
  initialFolders: FolderDto[];
  initialAnalytics: AnalyticsDto;
}) {
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? null);
  const [skills, setSkills] = useState(initialSkills);
  const [files, setFiles] = useState(initialFiles);
  const [folders, setFolders] = useState(initialFolders);
  const [folderId, setFolderId] = useState(initialFolderId ?? "");
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [retryMessageId, setRetryMessageId] = useState("");
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [pendingFileIds, setPendingFileIds] = useState<string[]>([]);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const skillInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId]);
  const selectableSkills = canManage ? skills : skills.filter((skill) => skill.status === "ENABLED");
  const selectedFolder = folders.find((folder) => folder.id === folderId);

  function replaceConversation(conversation: ConversationDto) {
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

  async function updateConversation(input: { title?: string; skillId?: string | null; fileIds?: string[] }, toast?: string, conversationId = selected?.id) {
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

  async function openFilePicker() {
    if (!selected || busy === "context") return;
    setPendingFileIds(selected.attachments.map((attachment) => attachment.id).filter(Boolean) as string[]);
    setFilePickerOpen(true);
  }

  async function applyFiles() {
    const updated = await updateConversation({ fileIds: pendingFileIds }, "对话文件已更新");
    if (updated) setFilePickerOpen(false);
  }

  async function removeFile(fileId: string | null) {
    if (!selected || !fileId) return;
    await updateConversation({ fileIds: selected.attachments.map((item) => item.id).filter((id): id is string => Boolean(id) && id !== fileId) });
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
    setStreaming(true);
    setRetryMessageId(retryMessageId ?? "");
    setStreamText("");
    setStatus(null);
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
            setDraft("");
            setConversations((current) => current.map((item) => item.id !== conversation!.id ? item : {
              ...item,
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
          setConversations((current) => current.map((item) => item.id !== conversation!.id ? item : {
            ...item,
            messages: [...item.messages, {
              id: event.assistantMessage.id,
              role: "ASSISTANT",
              content: event.assistantMessage.content,
              skillName: null,
              contextFiles: [],
              createdAt: event.assistantMessage.createdAt
            }],
            updatedAt: event.assistantMessage.createdAt,
            title: item.messages.some((stored) => stored.role === "USER") ? item.title : message.slice(0, 40)
          }));
          setStreamText("");
          setRetryMessageId("");
        } else {
          setStatus({ tone: "error", text: event.error });
        }
      });
    } catch (error) {
      setStatus({ tone: "error", text: controller.signal.aborted ? "已停止生成，可重试上一条问题" : error instanceof Error ? error.message : "Copilot 调用失败" });
    } finally {
      abortRef.current = null;
      setStreaming(false);
      if (!userMessageId && !retryMessageId) setStreamText("");
    }
  }

  async function saveFolder() {
    const shared = selectedFolder?.boundCourses.filter((course) => course.id !== courseId) ?? [];
    if (shared.length && !window.confirm(`该文件夹已用于「${shared.map((course) => course.title).join("、")}」。绑定后，本课程学生也能只读访问全部内容。继续吗？`)) return;
    setBusy("folder");
    try {
      await api(`/api/courses/${courseId}/copilot/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId || null })
      });
      setStatus({ tone: "success", text: folderId ? "课程云盘文件夹已绑定" : "课程云盘文件夹已解绑" });
      const fileBody = await api(`/api/courses/${courseId}/copilot/files`);
      setFiles(fileBody.files);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "文件夹设置失败" });
    } finally {
      setBusy("");
    }
  }

  async function createFolder(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    setBusy("folder-create");
    try {
      const body = await api("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const folder: FolderDto = { id: body.file.id, name: body.file.name, path: body.file.name, boundCourses: [] };
      setFolders((current) => [...current, folder].sort((a, b) => a.path.localeCompare(b.path, "zh-CN")));
      setFolderId(folder.id);
      setStatus({ tone: "success", text: "文件夹已创建，请点击“保存绑定”完成授权" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "创建文件夹失败" });
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
        <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-100 bg-white lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-slate-100 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
            <Button className="w-full" onClick={() => void createConversation()} disabled={busy === "conversation" || streaming}><MessageSquarePlus className="h-4 w-4" />新对话</Button>
            <div className="mt-4 space-y-2">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={`group flex items-center rounded-xl ${selectedId === conversation.id ? "bg-white shadow-sm" : "hover:bg-white/70"}`}>
                  <button type="button" onClick={() => { if (!streaming) { setSelectedId(conversation.id); setRetryMessageId(""); } }} className="min-w-0 flex-1 px-3 py-3 text-left">
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

          <section className="flex min-h-[620px] flex-col">
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative">
                  <span className="sr-only">选择 Skill</span>
                  <select value={selected?.activeSkill?.id ?? ""} onChange={(event) => void chooseSkill(event.target.value)} disabled={!selected || streaming || busy === "context"} className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none focus:border-blue-400">
                    <option value="">未选择 Skill</option>
                    {selectableSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}{canManage && skill.status !== "ENABLED" ? "（未启用）" : ""}</option>)}
                  </select>
                  <Sparkles className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-blue-600" />
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                </label>
                <Button type="button" variant="secondary" onClick={() => void openFilePicker()} disabled={!selected || streaming || busy === "context"}><Paperclip className="h-4 w-4" />@文件</Button>
                <span className="text-xs text-slate-400">对话仅你可见 · 每天最多 100 次</span>
              </div>
              {selected?.attachments.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.attachments.map((attachment) => (
                    <span key={attachment.id ?? attachment.name} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${attachment.available ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
                      {attachment.mimeType?.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}{attachment.name}
                      <button type="button" aria-label={`移除 ${attachment.name}`} disabled={streaming || busy === "context"} onClick={() => void removeFile(attachment.id)}><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {selected?.messages.map((message) => (
                <article key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "USER" ? "ml-auto bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                  {message.role === "USER" && (message.skillName || message.contextFiles.length) ? <p className="mb-2 text-xs text-blue-100">{message.skillName ? `Skill：${message.skillName}` : ""}{message.skillName && message.contextFiles.length ? " · " : ""}{message.contextFiles.length ? `${message.contextFiles.length} 个文件` : ""}</p> : null}
                  <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                </article>
              ))}
              {streamText ? <article className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-3 text-slate-800"><p className="whitespace-pre-wrap text-sm leading-7">{streamText}</p></article> : null}
              {!selected?.messages.length && !streamText ? <div className="mx-auto mt-20 max-w-md text-center"><Bot className="mx-auto h-10 w-10 text-blue-600" /><h2 className="mt-4 font-semibold text-slate-900">开始使用课程 Copilot</h2><p className="mt-2 text-sm leading-6 text-slate-500">Skill 是可选项；你也可以直接聊天，或添加课程文件后提问。</p></div> : null}
            </div>

            <div className="border-t border-slate-100 p-4">
              <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} disabled={streaming} placeholder={selected ? "输入问题，Enter 发送，Shift+Enter 换行" : "请先新建对话"} className="min-h-14 flex-1 resize-none border-0 bg-transparent text-sm outline-none" />
                {streaming ? <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}><X className="h-4 w-4" />停止</Button> : <Button type="button" onClick={() => void send()} disabled={!draft.trim()}><Send className="h-4 w-4" />发送</Button>}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">课程云盘文件夹</h2><p className="mt-1 text-sm text-slate-500">文件夹及全部子目录会实时对课程学生开放只读访问。</p></div><Link href="/space/drive" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"><FolderOpen className="h-4 w-4" />前往云盘管理</Link></div>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <select value={folderId} onChange={(event) => setFolderId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">尚未绑定</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}{folder.boundCourses.length ? `（${folder.boundCourses.length} 门课程）` : ""}</option>)}</select>
              <Button onClick={() => void saveFolder()} disabled={busy === "folder"}>{busy === "folder" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}保存绑定</Button>
            </div>
            <form action={createFolder} className="mt-3 flex gap-2"><Input name="name" placeholder="新建课程文件夹" /><Button type="submit" variant="secondary" disabled={busy === "folder-create"}><Plus className="h-4 w-4" />创建</Button></form>
            {selectedFolder?.boundCourses.length ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">已绑定课程：{selectedFolder.boundCourses.map((course) => course.title).join("、")}</p> : null}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="font-semibold text-slate-900">课程 Skill</h2><p className="mt-1 text-sm text-slate-500">支持 Markdown 和 ZIP，最大 10MB；上传后先测试，再启用给学生。</p>
            <form action={uploadSkill} className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4"><input ref={skillInputRef} name="file" type="file" accept=".md,.zip" required className="min-w-0 flex-1 text-sm" /><Button type="submit" disabled={busy === "skill-upload"}><UploadCloud className="h-4 w-4" />上传 Skill</Button></form>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {skills.map((skill) => <article key={skill.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-slate-900">{skill.name}</h3><p className="mt-1 text-sm text-slate-500">{skill.description}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${skill.status === "ENABLED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{skill.status === "ENABLED" ? "已启用" : "待启用"}</span></div>{skill.instructions ? <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-blue-600">预览完整指令</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{skill.instructions}</pre></details> : null}<div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => { setView("chat"); if (!selected) { void createConversation().then((conversation) => conversation && void chooseSkill(skill.id, conversation.id)); } else { void chooseSkill(skill.id, selected.id); } }}><Sparkles className="h-4 w-4" />测试</Button><Button variant="secondary" disabled={busy === `skill-${skill.id}`} onClick={() => void changeSkillStatus(skill)}>{skill.status === "ENABLED" ? "停用" : "启用"}</Button><Button variant="danger" disabled={skill.status !== "DISABLED" || busy === `skill-${skill.id}`} onClick={() => void deleteSkill(skill)}><Trash2 className="h-4 w-4" />删除</Button></div></article>)}
              {!skills.length ? <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">还没有 Skill。</p> : null}
            </div>
          </section>

          {initialAnalytics ? <section className="rounded-2xl border border-slate-100 bg-white p-5"><h2 className="font-semibold text-slate-900">近 7 日匿名使用情况</h2><div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="调用次数" value={initialAnalytics.calls} /><Metric label="活跃学生" value={initialAnalytics.activeUsers} /><Metric label="成功" value={initialAnalytics.success} /><Metric label="失败" value={initialAnalytics.failed} /></div>{initialAnalytics.skills.length ? <div className="mt-4 flex flex-wrap gap-2">{initialAnalytics.skills.map((skill) => <span key={skill.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{skill.name} · {skill.calls} 次</span>)}</div> : null}</section> : null}
        </div>
      )}

      {filePickerOpen ? <div role="dialog" aria-modal="true" aria-label="选择课程文件" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-semibold text-slate-900">@课程文件</h2><p className="mt-1 text-xs text-slate-500">最多 5 个文件；文档合计 100,000 字符，图片合计 20MB。</p></div><button type="button" onClick={() => setFilePickerOpen(false)}><X className="h-5 w-5" /></button></div><div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">{files.map((file) => { const checked = pendingFileIds.includes(file.id); return <label key={file.id} className={`flex items-center gap-3 rounded-xl border p-3 ${file.contextSelectable ? "cursor-pointer border-slate-100 hover:border-blue-200" : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"}`}><input type="checkbox" checked={checked} disabled={!file.contextSelectable} onChange={(event) => { if (event.target.checked) { if (pendingFileIds.length >= 5) { setStatus({ tone: "error", text: "每个对话最多添加 5 个文件" }); return; } setPendingFileIds((current) => [...current, file.id]); } else setPendingFileIds((current) => current.filter((id) => id !== file.id)); }} /><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{file.contextKind === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{file.path}</span><span className="text-xs text-slate-400">{file.contextReady ? `${Math.ceil(file.size / 1024)} KB` : file.contextSelectable ? "选择后自动解析" : file.extractionError || "当前格式暂不支持 AI 读取"}</span></span><a href={`/api/drive/${file.id}?preview=1`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-xs font-medium text-blue-600">查看</a></label>; })}{!files.length ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">课程尚未绑定文件夹，或文件夹中没有资料。</p> : null}</div><div className="flex justify-end gap-2 border-t border-slate-100 p-4"><Button variant="secondary" onClick={() => setFilePickerOpen(false)}>取消</Button><Button onClick={() => void applyFiles()} disabled={busy === "context"}>{busy === "context" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}添加 {pendingFileIds.length} 个文件</Button></div></div></div> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>;
}
