import Link from "next/link";
import { BookOpen, User } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { CoursePublishButton } from "@/components/courses/CoursePublishButton";
import { CourseActionsMenu } from "@/components/courses/CourseActionsMenu";

type CourseCardProps = {
  course: {
    id: string;
    title: string;
    description?: string | null;
    cover?: string | null;
    term?: string | null;
    owner?: { name: string } | null;
    progress?: number;
    enrollments?: Array<unknown>;
    status?: string;
    accessRole?: "OWNER" | "COLLABORATOR";
  };
  mode: "learned" | "taught";
};

const coverStyles: Record<string, string> = {
  document: "from-sky-500 to-cyan-400",
  tool: "from-emerald-500 to-teal-400",
  ai: "from-[#5669c9] to-[#7b6bd8]",
  plain: "from-[#5264bd] to-[#7a70d6]"
};

function getCoverStyle(cover?: string | null) {
  const style = cover?.startsWith("cover:") ? cover.slice(6) : "plain";
  return coverStyles[style] ?? coverStyles.plain;
}

export function CourseCard({ course, mode }: CourseCardProps) {
  const progress = Math.max(0, Math.min(course.progress ?? 0, 100));

  return (
    <article className="group overflow-hidden rounded-2xl border border-[var(--cx-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-floating">
      <Link href={`/space/courses/${course.id}`} className={`cx-focus-ring relative flex h-36 bg-gradient-to-br ${getCoverStyle(course.cover)} p-4 text-white`}>
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_44%)]" aria-hidden="true" />
        <div className="relative mt-auto">
          <p className="text-xs font-medium text-white/75">{course.term ?? "本学期"}</p>
          <h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-6">{course.title}</h2>
        </div>
      </Link>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 font-semibold text-slate-900">{course.title}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              {course.owner?.name ?? "本地教师"}
            </p>
          </div>
          {mode === "taught" ? (
            <div className="flex flex-col items-end gap-1.5">
              <Badge tone={course.accessRole === "COLLABORATOR" ? "blue" : "gray"}>
                {course.accessRole === "COLLABORATOR" ? "协作教师" : "课程所有者"}
              </Badge>
              <Badge tone={course.status === "ACTIVE" ? "green" : "orange"}>
                {course.status === "ACTIVE" ? "已发布" : "草稿"}
              </Badge>
            </div>
          ) : null}
        </div>

        {mode === "learned" ? (
          <div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>学习进度</span>
              <span>{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="学习进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
            >
              <div className="h-2 rounded-full bg-gradient-to-r from-[var(--cx-blue)] to-[#8770df] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">学生 {course.enrollments?.length ?? 0} 人</p>
        )}

        <div className="grid grid-cols-2 items-start gap-2 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap">
          <LinkButton href={`/space/courses/${course.id}`} variant="secondary" className="col-span-2 h-9 px-3 sm:col-span-1 sm:flex-1">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            进入课程
          </LinkButton>
          {mode === "taught" && course.accessRole !== "COLLABORATOR" && course.status && course.status !== "ACTIVE" ? (
            <CoursePublishButton courseId={course.id} status={course.status} className="h-9 w-full px-3 sm:w-auto" />
          ) : null}
          {mode === "taught" && course.accessRole !== "COLLABORATOR" && course.status ? <CourseActionsMenu courseId={course.id} title={course.title} status={course.status} /> : null}
        </div>
      </div>
    </article>
  );
}
