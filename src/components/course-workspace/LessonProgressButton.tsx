"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function LessonProgressButton({ courseId, lessonId, completed }: { courseId: string; lessonId: string; completed: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function toggle() { setBusy(true); setError(""); const response = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !completed }) }); setBusy(false); if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; setError(body?.error ?? "更新失败"); return; } router.refresh(); }
  return <div className="flex items-center gap-2"><Button type="button" variant="secondary" className="h-8" disabled={busy} onClick={toggle}>{completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}{completed ? "已完成" : "标记完成"}</Button>{error ? <span className="text-xs text-red-600">{error}</span> : null}</div>;
}
