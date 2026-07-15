"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, QrCode, RefreshCw, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

type StudentRecord = { userId: string; name: string; status: string; signedAt: string | null };
type AttendanceSessionDto = { id: string; title: string; status: string; startsAt: string | null; endsAt: string | null; records: StudentRecord[]; myStatus?: string | null };

export function AttendanceClient({ courseId, canManage, sessions, students }: { courseId: string; canManage: boolean; sessions: AttendanceSessionDto[]; students: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState(sessions.find((session) => session.status === "ACTIVE" && (!session.endsAt || new Date(session.endsAt) > new Date()))?.id ?? "");
  const [credential, setCredential] = useState<{ token: string; code: string; expiresAt: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const selectedSession = useMemo(() => sessions.find((session) => session.id === selectedSessionId), [sessions, selectedSessionId]);

  async function request(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "操作失败");
      setSuccess("操作成功");
      router.refresh();
      return body;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!canManage || !selectedSessionId || selectedSession?.status !== "ACTIVE") {
      setCredential(null);
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    async function refreshCredential() {
      const response = await fetch(`/api/courses/${courseId}/attendance/${selectedSessionId}/token`);
      const body = await response.json().catch(() => null) as { token?: string; code?: string; expiresAt?: string } | null;
      if (!response.ok || !body?.token || !body.code || !body.expiresAt || cancelled) return;
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
    const sessionId = searchParams.get("sessionId");
    const value = searchParams.get("credential");
    if (!sessionId || !value) return;
    void request(`/api/courses/${courseId}/attendance/${sessionId}/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: value }) });
    // The URL credential should be consumed only once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(formData: FormData) {
    const body = await request(`/api/courses/${courseId}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), durationMinutes: Number(formData.get("durationMinutes")) }) }) as { session?: { id?: string } } | null;
    if (body?.session?.id) setSelectedSessionId(body.session.id);
  }

  async function checkIn(sessionId: string, formData: FormData) {
    await request(`/api/courses/${courseId}/attendance/${sessionId}/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: formData.get("credential") }) });
  }

  return <div className="space-y-5">
    {canManage ? <form action={create} className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 md:grid-cols-[1fr_160px_auto] md:items-end"><label className="space-y-1 text-sm"><span>签到名称</span><Input name="title" required defaultValue="课堂签到" /></label><label className="space-y-1 text-sm"><span>有效分钟</span><Input name="durationMinutes" type="number" min={1} max={180} defaultValue={10} /></label><Button type="submit" disabled={busy}><QrCode className="h-4 w-4" />创建并开始</Button></form> : null}
    {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
    {canManage && selectedSession?.status === "ACTIVE" ? <section className="grid gap-5 rounded-2xl border border-slate-100 p-5 lg:grid-cols-[360px_1fr]"><div className="text-center"><h2 className="font-semibold text-slate-900">{selectedSession.title}</h2>{qrDataUrl ? <img src={qrDataUrl} alt="学生签到二维码" className="mx-auto mt-4 w-72 rounded-xl border bg-white p-2" /> : <div className="mx-auto mt-4 flex h-72 w-72 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">正在生成二维码</div>}<p className="mt-3 text-sm text-slate-500">备用签到码</p><p className="mt-1 font-mono text-3xl font-semibold tracking-[0.3em] text-blue-700">{credential?.code ?? "------"}</p><p className="mt-2 text-xs text-slate-400">二维码和短码会自动刷新</p></div><div><div className="flex items-center justify-between"><h3 className="font-semibold">实时签到名单</h3><Button type="button" variant="danger" className="h-8" onClick={() => request(`/api/courses/${courseId}/attendance/${selectedSession.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "END" }) })}><StopCircle className="h-4 w-4" />结束签到</Button></div><div className="mt-4 space-y-2">{students.map((student) => { const record = selectedSession.records.find((item) => item.userId === student.id); return <div key={student.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"><span className="min-w-24 flex-1 text-sm font-medium">{student.name}</span><Badge tone={record?.status === "PRESENT" ? "green" : record?.status === "LEAVE" ? "orange" : "gray"}>{record?.status === "PRESENT" ? "已签到" : record?.status === "LEAVE" ? "请假" : record?.status === "ABSENT" ? "缺勤" : "未签到"}</Badge>{["PRESENT", "LEAVE", "ABSENT"].map((status) => <Button key={status} type="button" variant="secondary" className="h-7 px-2 text-xs" disabled={busy} onClick={() => request(`/api/courses/${courseId}/attendance/${selectedSession.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SET_RECORD", userId: student.id, status }) })}>{status === "PRESENT" ? "补签" : status === "LEAVE" ? "请假" : "缺勤"}</Button>)}</div>; })}</div></div></section> : null}
    <div className="space-y-3">{sessions.map((session) => <article key={session.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{session.title}</h2><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{session.startsAt ? new Date(session.startsAt).toLocaleString("zh-CN") : "尚未开始"}</p></div><Badge tone={session.status === "ACTIVE" ? "green" : "gray"}>{session.status === "ACTIVE" ? "进行中" : "已结束"}</Badge></div>{canManage ? <div className="mt-4 flex gap-2"><Button type="button" variant="secondary" className="h-8" onClick={() => setSelectedSessionId(session.id)}>{session.status === "ACTIVE" ? <><QrCode className="h-4 w-4" />展示二维码</> : "查看记录"}</Button>{session.status === "ENDED" ? <Button type="button" variant="secondary" className="h-8" onClick={() => request(`/api/courses/${courseId}/attendance/${session.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REOPEN", durationMinutes: 10 }) })}><RefreshCw className="h-4 w-4" />重新开启</Button> : null}</div> : <div className="mt-4">{session.myStatus === "PRESENT" ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" />已签到</p> : session.status === "ACTIVE" ? <form action={(formData) => checkIn(session.id, formData)} className="flex max-w-sm gap-2"><Input name="credential" required inputMode="numeric" pattern="[0-9]{6}" placeholder="输入 6 位签到码" /><Button type="submit" disabled={busy}>签到</Button></form> : <p className="text-sm text-slate-500">{session.myStatus === "LEAVE" ? "已请假" : "未签到"}</p>}</div>}</article>)}{!sessions.length ? <p className="text-sm text-slate-500">当前暂无签到活动。</p> : null}</div>
  </div>;
}
