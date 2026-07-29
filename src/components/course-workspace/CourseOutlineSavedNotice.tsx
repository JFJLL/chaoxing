import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";

export function CourseOutlineSavedNotice({ courseId }: { courseId: string }) {
  return (
    <div role="status" className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">课程目录已保存</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800">目录已进入只读状态；后续修改请先点右上角“编辑”。</p>
        </div>
      </div>
      <Link href={`/space/courses/${courseId}/ai-workbench/apps/lesson_plan`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--cx-blue)] px-4 text-sm font-medium text-white">
        <Sparkles className="h-4 w-4" aria-hidden="true" />生成 AI 教案
      </Link>
    </div>
  );
}
