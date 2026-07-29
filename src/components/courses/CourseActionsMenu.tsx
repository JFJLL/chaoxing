"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { CourseDeleteButton } from "@/components/courses/CourseDeleteButton";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";
import { CourseCollaborationDialog } from "@/components/courses/CourseCollaborationDialog";

export function CourseActionsMenu({ courseId, title, status }: { courseId: string; title: string; status: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        aria-label={`更多课程操作：${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="cx-focus-ring cx-tactile inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--cx-border-strong)] bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="课程操作" className="absolute bottom-full right-0 z-20 mb-2 w-44 space-y-2 rounded-xl border border-[var(--cx-border)] bg-white p-2 shadow-floating">
          {status === "ACTIVE" ? <CoursePublishButton courseId={courseId} status={status} className="h-9 w-full justify-start px-3" /> : null}
          <CourseCollaborationDialog courseId={courseId} />
          <CourseDeleteButton courseId={courseId} title={title} className="w-full" />
        </div>
      ) : null}
    </div>
  );
}
