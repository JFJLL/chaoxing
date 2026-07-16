"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type CoursePublishButtonProps = {
  courseId: string;
  status: string;
  className?: string;
};

export function CoursePublishButton({ courseId, status, className }: CoursePublishButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const nextStatus = status === "ACTIVE" ? "DRAFT" : "ACTIVE";

  async function updateStatus() {
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/courses/${courseId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    setSubmitting(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "更新课程状态失败");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" className={className} onClick={updateStatus} disabled={submitting}>
        {submitting ? "更新中" : status === "ACTIVE" ? "撤回发布" : "发布课程"}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
