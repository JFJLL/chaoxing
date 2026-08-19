"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

export function NewCourseDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    const joining = mode === "join";
    const response = await fetch(joining ? "/api/courses/collaborations/join" : "/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(joining ? { code: form.get("code") } : {
        title: form.get("title"), coverStyle: form.get("coverStyle"),
        startsAt: form.get("startsAt") || undefined, endsAt: form.get("endsAt") || undefined
      })
    });

    setSubmitting(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? (joining ? "加入协作课程失败" : "新建课程失败"));
      return;
    }

    const body = (await response.json()) as { course?: { id: string } };
    setOpen(false);
    if (body.course?.id) {
      window.dispatchEvent(new CustomEvent("teacher-onboarding:course-created", { detail: { courseId: body.course.id } }));
      // 新手引导的第三步锚点在 AI 工作台；直接进入目标页面，避免先加载默认课程页再重定向。
      router.push(`/space/courses/${body.course.id}/ai-workbench`);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Button type="button" data-teacher-onboarding="create-course" onClick={() => { setMode("create"); setOpen(true); }}>
        <Plus className="h-4 w-4" />
        新建课程
      </Button>
      <Button type="button" variant="secondary" onClick={() => { setMode("join"); setOpen(true); }}>
        加入协作课程
      </Button>
      <Dialog open={open} title={mode === "join" ? "加入协作课程" : "新建课程"} onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "join" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">教师协作码</span>
              <Input name="code" required minLength={4} placeholder="输入同机构课程的教师协作码" className="w-full" />
            </label>
          ) : <>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">课程名称</span>
            <Input name="title" required minLength={2} placeholder="请输入课程名称" className="w-full" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">封面风格</span>
            <select name="coverStyle" className="h-10 w-full rounded-md border border-[var(--cx-border)] bg-white px-3 text-sm">
              <option value="ai">AI</option>
              <option value="document">文档</option>
              <option value="tool">工具</option>
              <option value="plain">素色</option>
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">开始日期</span>
              <Input name="startsAt" type="date" className="w-full" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">结束日期</span>
              <Input name="endsAt" type="date" className="w-full" />
            </label>
          </div>
          </>}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (mode === "join" ? "加入中" : "创建中") : (mode === "join" ? "加入" : "创建")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
