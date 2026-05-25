import { ArrowRight, BookOpen, FileText, Inbox, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export default async function SpaceHomePage() {
  const user = await requireUser();
  const [learnedCourses, taughtCourses, messages, topics] = await Promise.all([
    db.courseEnrollment.findMany({
      where: { userId: user.id },
      take: 3,
      include: { course: true },
      orderBy: { updatedAt: "desc" }
    }),
    db.course.findMany({
      where: { ownerId: user.id },
      take: 3,
      orderBy: { updatedAt: "desc" }
    }),
    db.message.findMany({
      where: { receiverId: user.id, deletedByReceiverAt: null },
      take: 3,
      orderBy: { createdAt: "desc" },
      include: { sender: true }
    }),
    db.topic.findMany({
      where: { ownerId: user.id, deletedAt: null },
      take: 3,
      orderBy: { updatedAt: "desc" }
    })
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--cx-border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-[var(--cx-muted)]">欢迎回来，{user.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">首页</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/space/courses" variant="primary">
            <BookOpen className="h-4 w-4" />
            进入课程
          </LinkButton>
          <LinkButton href="/space/topics" variant="secondary">
            <Plus className="h-4 w-4" />
            新建专题
          </LinkButton>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-[var(--cx-border)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">课程预览</h2>
            <LinkButton href="/space/courses" variant="ghost" className="h-8 px-2">
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ...learnedCourses.map((item) => ({
                id: item.id,
                progress: item.progress,
                course: item.course
              })),
              ...taughtCourses.map((course) => ({ id: course.id, progress: 0, course }))
            ].map((item) => (
              <div key={item.id} className="rounded-md bg-slate-50 p-3">
                <p className="line-clamp-1 text-sm font-medium text-slate-800">{item.course.title}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{item.course.term ?? "本学期"}</span>
                  <Badge tone={item.progress > 0 ? "blue" : "gray"}>{item.progress > 0 ? `${item.progress}%` : "我教的课"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--cx-border)] p-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-[var(--cx-blue)]" />
            <h2 className="font-semibold text-slate-900">收件箱</h2>
          </div>
          <div className="mt-4 space-y-3">
            {messages.map((message) => (
              <div key={message.id} className="rounded-md bg-slate-50 p-3">
                <p className="line-clamp-1 text-sm font-medium text-slate-800">{message.subject}</p>
                <p className="mt-1 text-xs text-slate-500">来自 {message.sender.name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--cx-border)] p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--cx-blue)]" />
            <h2 className="font-semibold text-slate-900">专题创作</h2>
          </div>
          <div className="mt-4 space-y-3">
            {topics.map((topic) => (
              <div key={topic.id} className="rounded-md bg-slate-50 p-3">
                <p className="line-clamp-1 text-sm font-medium text-slate-800">{topic.title}</p>
                <p className="mt-1 text-xs text-slate-500">{topic.status === "PUBLISHED" ? "已发布" : "草稿"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
