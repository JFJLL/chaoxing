"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";

export function CourseDeleteButton({ courseId, title, className }: { courseId: string; title: string; className?: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function onDelete() {
    if (!window.confirm(`确定删除课程“${title}”吗？删除后学生将无法继续访问该课程。`)) {
      return;
    }

    setDeleting(true);
    setError("");
    const response = await fetch(`/api/courses/${courseId}`, {
      method: "DELETE"
    });
    setDeleting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "删除课程失败");
      return;
    }

    router.refresh();
  }

  return (
    <div className={clsx("space-y-1", className)}>
      <Button
        type="button"
        variant="danger"
        className="h-9 px-3"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`删除课程 ${title}`}
      >
        <Trash2 className="h-4 w-4" />
        {deleting ? "删除中" : "删除"}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
