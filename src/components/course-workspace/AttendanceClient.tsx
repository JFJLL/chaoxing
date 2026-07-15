"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, Plus, QrCode, RefreshCw, StopCircle, UserCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

type StudentRecord = { userId: string; name: string; status: string; signedAt: string | null };
type AttendanceSessionDto = { id: string; title: string; status: string; startsAt: string | null; endsAt: string | null; records: StudentRecord[]; myStatus?: string | null };
const statusLabel: Record<string, string> = { PRESENT: "已签到", LEAVE: "请假", ABSENT: "缺勤" };

export function AttendanceClient({ courseId, canManage, sessions, students }: { courseId: string; canManage: boolean; sessions: AttendanceSessionDto[]; students: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sessionItems, setSessionItems] = useState(sessions);
  const [creating, setCreating] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(sessions.find((session) => session.status === "ACTIVE")?.id ?? "");
  const [credential, setCredential] = useState<{ token: string; code: string; expiresAt: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const selectedSession = useMemo(() => sessionItems.find((session) => session.id === selectedSessionId), [sessionItems, selectedSessionId]);
  const activeCount = sessionItems.filter((session) => session.status === "ACTIVE").length;
  const endedCount = sessionItems.filter((session) => session.status === "ENDED").length;

  useEffect(() => {
    setSessionItems((current) => [
      ...sessions,
      ...current.filter((session) => !sessions.some((serverSession) => serverSession.id === session.id))
    ]);
  }, [sessions]);

  useEffect(() => {
    if (!canManage || activeCount === 0) return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [activeCount, canManage, router]);

  async function request(url: string, init: RequestInit, successText = "操作成功") {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string; session?: AttendanceSessionDto; record?: { userId: string; status: string; signedAt: string | null } } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      setSuccess(successText); router.refresh(); return body;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败"); return null;
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!canManage || !selectedSessionId || selectedSession?.status !== "ACTIVE") { setCredential(null); setQrDataUrl(""); return; }
    let cancelled = false;
    async function refreshCredential() {
      const response = await fetch(`/api/courses/${courseId}/attendance/${selectedSessionId}/token`);
      const body = await response.json().catch(() => null) as { token?: string; code?: string; expiresAt?: string } | null;
      if (!response.ok || !body?.token || !body.code || !body.expiresAt || cancelled) {
        if (response.status === 409 && !cancelled) { setCredential(null); setQrDataUrl(""); router.refresh(); }
        return;
      }
      const next = { token: body.token, code: body.code, expiresAt: body.expiresAt };
      setCredential(next);
      const url = `${window.location.origin}/space/courses/${courseId}/attendance?sessionId=${encodeURIComponent(selectedSessionId)}&credential=${encodeURIComponent(next.token)}`;
      const { default: QRCode } = await import("qrcode");
      setQrDataUrl(await QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: "M" }));
    }
    void refreshCredential();
    const timer = window.setInterval(() => void refreshCredential(), 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [canManage, courseId, selectedSession?.status, selectedSessionId]);

  useEffect(() => {
    if (canManage) return;
    const sessionId = searchParams.get("sessionId"); const value = searchParams.get("credential");
    if (sessionId && value) void request(`/api/courses/${courseId}/attendance/${sessionId}/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: value }) }, "签到成功");
    // The URL credential should be consumed only once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(formData: FormData) {
    const body = await request(`/api/courses/${courseId}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), durationMinutes: Number(formData.get("durationMinutes")) }) }, "签到已开始");
    if (body?.session?.id) {
      const session = { ...body.session, records: body.session.records ?? [] };
      setSessionItems((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      setSelectedSessionId(session.id); setCreating(false);
    }
  }
  async function checkIn(sessionId: string, formData: FormData) {
    const result = await request(`/api/courses/${courseId}/attendance/${sessionId}/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: formData.get("credential") }) }, "签到成功");
    if (result?.record) setSessionItems((current) => current.map((session) => session.id === sessionId ? { ...session, myStatus: "PRESENT" } : session));
  }
  async function setRecord(sessionId: string, userId: string, status: string) {
    const result = await request(`/api/courses/${courseId}/attendance/${sessionId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SET_RECORD", userId, status }) }, "出勤状态已更新");
    if (!result) return;
    setSessionItems((current) => current.map((session) => {
      if (session.id !== sessionId) return session;
      const existing = session.records.find((record) => record.userId === userId);
      const nextRecord = { userId, name: students.find((student) => student.id === userId)?.name ?? existing?.name ?? "学生", status, signedAt: status === "PRESENT" ? new Date().toISOString() : null };
      return { ...session, records: existing ? session.records.map((record) => record.userId === userId ? nextRecord : record) : [...session.records, nextRecord] };
    }));
  }

  return <div className="space-y-6">
    {canManage ? <div className="grid gap-3 sm:grid-cols-3"><SummaryCard icon={UsersRound} label="签到记录" value={`${sessionItems.length} 次`} /><SummaryCard icon={QrCode} label="进行中" value={`${activeCount} 次`} /><SummaryCard icon={UserCheck} label="已结束" value={`${endedCount} 次`} /></div> : null}
    {canManage ? <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">签到记录</h2><p className="mt-1 text-sm text-slate-500">先查看历史和进行中签到，需要时再发起新签到。</p></div><Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />发起签到</Button></div> : null}
    {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}{success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

    {canManage && selectedSession ? <section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-900">{selectedSession.title}</h2><Badge tone={selectedSession.status === "ACTIVE" ? "green" : "gray"}>{selectedSession.status === "ACTIVE" ? "进行中" : "已结束"}</Badge></div><p className="mt-1 text-xs text-slate-500">{selectedSession.startsAt ? new Date(selectedSession.startsAt).toLocaleString("zh-CN") : "尚未开始"}</p></div><div className="flex gap-2">{selectedSession.status === "ACTIVE" ? <Button type="button" variant="danger" className="h-9" onClick={() => setConfirmEnd(true)}><StopCircle className="h-4 w-4" />结束签到</Button> : <Button type="button" variant="secondary" className="h-9" disabled={busy} onClick={async () => { const result = await request(`/api/courses/${courseId}/attendance/${selectedSession.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REOPEN", durationMinutes: 10 }) }, "签到已重新开启"); if (result) { const now = new Date(); setSessionItems((current) => current.map((session) => session.id === selectedSession.id ? { ...session, status: "ACTIVE", startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 10 * 60_000).toISOString() } : session)); } }}><RefreshCw className="h-4 w-4" />重新开启 10 分钟</Button>}</div></div>
      <div className={`mt-5 grid gap-5 ${selectedSession.status === "ACTIVE" ? "lg:grid-cols-[340px_1fr]" : ""}`}>{selectedSession.status === "ACTIVE" ? <div className="rounded-2xl bg-slate-50 p-4 text-center">{qrDataUrl ? <img src={qrDataUrl} alt="学生签到二维码" className="mx-auto w-64 rounded-xl border bg-white p-2" /> : <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-xl bg-white text-sm text-slate-500">正在生成二维码</div>}<p className="mt-3 text-sm text-slate-500">备用签到码</p><p className="mt-1 font-mono text-3xl font-semibold tracking-[0.3em] text-blue-700">{credential?.code ?? "------"}</p><p className="mt-2 text-xs text-slate-400">二维码和短码会自动刷新</p></div> : null}<AttendanceRoster session={selectedSession} students={students} busy={busy} onSetRecord={setRecord} /></div>
    </section> : null}

    <div className="space-y-3">{sessionItems.map((session) => { const present = session.records.filter((record) => record.status === "PRESENT").length; const leave = session.records.filter((record) => record.status === "LEAVE").length; const absent = session.records.filter((record) => record.status === "ABSENT").length; return <article key={session.id} className={`rounded-2xl border p-5 ${selectedSessionId === session.id ? "border-blue-200 bg-blue-50/40" : "border-slate-100 bg-slate-50"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-900">{session.title}</h2><Badge tone={session.status === "ACTIVE" ? "green" : "gray"}>{session.status === "ACTIVE" ? "进行中" : "已结束"}</Badge></div><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{session.startsAt ? new Date(session.startsAt).toLocaleString("zh-CN") : "尚未开始"}</p>{canManage ? <p className="mt-2 text-xs text-slate-500">已签到 {present} · 请假 {leave} · 缺勤 {absent} · 未记录 {Math.max(0, students.length - session.records.length)}</p> : null}</div>{canManage ? <Button type="button" variant="secondary" className="h-9" onClick={() => setSelectedSessionId(session.id)}>{session.status === "ACTIVE" ? <><QrCode className="h-4 w-4" />进入实时签到</> : "查看完整记录"}</Button> : session.myStatus === "PRESENT" ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" />已签到</p> : session.status === "ACTIVE" ? <form action={(formData) => checkIn(session.id, formData)} className="flex max-w-sm gap-2"><Input name="credential" required inputMode="numeric" pattern="[0-9]{6}" placeholder="输入 6 位签到码" /><Button type="submit" disabled={busy}>签到</Button></form> : <p className="text-sm text-slate-500">{session.myStatus === "LEAVE" ? "已请假" : "未签到"}</p>}</div></article>; })}{!sessionItems.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{canManage ? "还没有签到记录，点击右上角发起第一次签到。" : "当前没有签到活动。"}</p> : null}</div>

    <Dialog open={creating} title="发起签到" onClose={() => !busy && setCreating(false)}><form action={create} className="space-y-4"><label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">签到名称</span><Input name="title" required defaultValue="课堂签到" /></label><fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">有效时长</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[5, 10, 20, 30].map((minutes) => <label key={minutes} className="flex cursor-pointer items-center justify-center rounded-lg border bg-slate-50 p-3 text-sm"><input className="sr-only peer" name="durationMinutes" type="radio" value={minutes} defaultChecked={minutes === 10} /><span className="peer-checked:font-semibold peer-checked:text-blue-700">{minutes} 分钟</span></label>)}</div></fieldset><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>取消</Button><Button type="submit" disabled={busy}><QrCode className="h-4 w-4" />创建并开始</Button></div></form></Dialog>
    <Dialog open={confirmEnd} title="结束签到" onClose={() => !busy && setConfirmEnd(false)}><p className="text-sm leading-6 text-slate-600">结束后二维码立即失效，仍可在历史记录中补签、标记请假或缺勤。</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setConfirmEnd(false)}>继续签到</Button><Button type="button" variant="danger" disabled={busy} onClick={async () => { if (!selectedSession) return; const result = await request(`/api/courses/${courseId}/attendance/${selectedSession.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "END" }) }, "签到已结束"); if (result) setSessionItems((current) => current.map((session) => session.id === selectedSession.id ? { ...session, status: "ENDED", endsAt: new Date().toISOString() } : session)); setConfirmEnd(false); }}>确认结束</Button></div></Dialog>
  </div>;
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof QrCode; label: string; value: string }) { return <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><Icon className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value}</p></article>; }

function AttendanceRoster({ session, students, busy, onSetRecord }: { session: AttendanceSessionDto; students: Array<{ id: string; name: string }>; busy: boolean; onSetRecord: (sessionId: string, userId: string, status: string) => Promise<unknown> }) {
  return <div><div className="flex items-center justify-between"><h3 className="font-semibold">完整签到名单</h3><Badge tone="blue">{students.length} 人</Badge></div><div className="mt-3 max-h-[520px] space-y-2 overflow-auto">{students.map((student) => { const record = session.records.find((item) => item.userId === student.id); return <div key={student.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"><span className="min-w-24 flex-1 text-sm font-medium">{student.name}</span><Badge tone={record?.status === "PRESENT" ? "green" : record?.status === "LEAVE" ? "orange" : "gray"}>{record ? statusLabel[record.status] ?? record.status : "未签到"}</Badge>{["PRESENT", "LEAVE", "ABSENT"].map((status) => <Button key={status} type="button" variant="secondary" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onSetRecord(session.id, student.id, status)}>{status === "PRESENT" ? "补签" : status === "LEAVE" ? "请假" : "缺勤"}</Button>)}</div>; })}</div></div>;
}
