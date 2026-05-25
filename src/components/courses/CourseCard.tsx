import Link from "next/link";
import { BookOpen, Bot, Hammer, User } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

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
  };
  mode: "learned" | "taught";
};

const coverStyles: Record<string, string> = {
  document: "from-sky-500 to-cyan-400",
  tool: "from-emerald-500 to-teal-400",
  ai: "from-indigo-500 to-blue-400",
  plain: "from-slate-500 to-slate-400"
};

function getCoverStyle(cover?: string | null) {
  const style = cover?.startsWith("cover:") ? cover.slice(6) : "plain";
  return coverStyles[style] ?? coverStyles.plain;
}

export function CourseCard({ course, mode }: CourseCardProps) {
  const progress = course.progress ?? 0;

  return (
    <article className="overflow-hidden rounded-md border border-[var(--cx-border)] bg-white transition hover:-translate-y-0.5 hover:shadow-panel">
      <Link href={`/space/courses/${course.id}`} className={`flex h-32 bg-gradient-to-br ${getCoverStyle(course.cover)} p-4 text-white`}>
        <div className="mt-auto">
          <p className="text-xs opacity-80">{course.term ?? "本学期"}</p>
          <h2 className="mt-1 line-clamp-2 text-lg font-semibold">{course.title}</h2>
        </div>
      </Link>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 font-medium text-slate-900">{course.title}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <User className="h-3.5 w-3.5" />
              {course.owner?.name ?? "本地教师"}
            </p>
          </div>
          {mode === "taught" ? <Badge tone="blue">教</Badge> : null}
        </div>

        {mode === "learned" ? (
          <div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>学习进度</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-[var(--cx-blue)]" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">学生 {course.enrollments?.length ?? 0} 人</p>
        )}

        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/space/courses/${course.id}`} variant="secondary" className="h-9 px-3">
            <BookOpen className="h-4 w-4" />
            进入课程
          </LinkButton>
          {mode === "taught" ? (
            <>
              <LinkButton href={`/space/courses/${course.id}/builder`} variant="secondary" className="h-9 px-3">
                <Hammer className="h-4 w-4" />
                课程建设
              </LinkButton>
              <LinkButton href={`/space/courses/${course.id}/ai-import`} variant="primary" className="h-9 px-3">
                <Bot className="h-4 w-4" />
                AI 文档建课
              </LinkButton>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
