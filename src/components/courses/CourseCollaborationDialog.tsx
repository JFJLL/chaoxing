"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type Collaborator = { id: string; name: string; email: string; role: string; joinedAt: string };
type CollaborationCode = { id: string; code: string; usedCount: number; maxUses: number | null; expiresAt: string | null };

export function CourseCollaborationDialog({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [codes, setCodes] = useState<CollaborationCode[]>([]);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null) as { error?: string; collaborators?: Collaborator[]; codes?: CollaborationCode[]; code?: CollaborationCode } | null;
    if (!response.ok) throw new Error(body?.error ?? "操作失败");
    return body;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [members, inviteCodes] = await Promise.all([
        request(`/api/courses/${courseId}/collaborators`),
        request(`/api/courses/${courseId}/collaboration-codes`)
      ]);
      setCollaborators(members?.collaborators ?? []);
      setCodes(inviteCodes?.codes ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "协作信息加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function createCode() {
    setError("");
    try {
      const body = await request(`/api/courses/${courseId}/collaboration-codes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUses: 20 })
      });
      if (body?.code) setCodes((current) => [body.code!, ...current]);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "生成失败"); }
  }

  async function removeCollaborator(userId: string) {
    if (!window.confirm("移除后该教师将无法继续管理课程，确认移除？")) return;
    try {
      await request(`/api/courses/${courseId}/collaborators/${userId}`, { method: "DELETE" });
      setCollaborators((current) => current.filter((item) => item.id !== userId));
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "移除失败"); }
  }

  return <>
    <button type="button" role="menuitem" className="h-9 w-full rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpen(true); void load(); }}>管理协作教师</button>
    <Dialog open={open} title="教师协作" onClose={() => setOpen(false)}>
      <div className="space-y-5">
        <section><div className="flex items-center justify-between gap-3"><div><h3 className="font-medium text-slate-900">教师协作码</h3><p className="text-xs text-slate-500">仅同机构教师可加入；协作教师不能管理协作码。</p></div><Button type="button" onClick={() => void createCode()}>生成协作码</Button></div>
          <div className="mt-3 space-y-2">{codes.map((code) => <div key={code.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><code className="font-semibold text-blue-700">{code.code}</code><span className="text-xs text-slate-500">已使用 {code.usedCount}{code.maxUses ? `/${code.maxUses}` : ""}</span></div>)}{!codes.length && !loading ? <p className="text-sm text-slate-500">暂无有效协作码。</p> : null}</div>
        </section>
        <section><h3 className="font-medium text-slate-900">协作教师</h3><div className="mt-3 space-y-2">{collaborators.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-medium text-slate-800">{member.name}</p><p className="text-xs text-slate-500">{member.email}</p></div><Button type="button" variant="danger" onClick={() => void removeCollaborator(member.id)}>移除</Button></div>)}{!collaborators.length && !loading ? <p className="text-sm text-slate-500">暂无协作教师。</p> : null}</div></section>
        {loading ? <p role="status" className="text-sm text-slate-500">正在加载协作信息…</p> : null}
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </Dialog>
  </>;
}
