import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { KnowledgeMapGraph } from "@/components/course-workspace/KnowledgeMapGraph";
import { CourseWorkspaceBreadcrumbs } from "@/components/course-workspace/CourseWorkspaceBreadcrumbs";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function KnowledgeMapPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const map = await db.courseKnowledgeMap.findFirst({
    where: { courseId, status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      nodes: { orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }] },
      edges: { orderBy: { createdAt: "asc" } }
    }
  });
  const typeLabels: Record<string, string> = {
    course: "课程总览",
    objective: "学习目标",
    chapter: "章节模块",
    lesson: "课时路径",
    concept: "核心概念",
    activity: "课堂活动",
    assessment: "评价检测"
  };
  const relationLabels: Record<string, string> = {
    outcome: "目标关系",
    contains: "结构关系",
    precedes: "先后关系",
    relates: "递进关系",
    practice: "实践关系",
    applies: "应用关系",
    checks: "检测关系",
    evaluates: "评价关系"
  };
  const groupedNodes = map
    ? ["objective", "chapter", "lesson", "concept", "activity", "assessment"].map((type) => ({
        type,
        label: typeLabels[type],
        nodes: map.nodes.filter((node) => node.type === type).slice(0, 8)
      }))
    : [];
  const relationStats = map
    ? Object.entries(
        map.edges.reduce<Record<string, number>>((acc, edge) => {
          acc[edge.type] = (acc[edge.type] ?? 0) + 1;
          return acc;
        }, {})
      )
    : [];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="knowledge-map">
      <section className="rounded-[28px] bg-white p-6 shadow-sm">
        <CourseWorkspaceBreadcrumbs courseId={course.id} courseTitle={course.title} current="知识图谱" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">知识图谱</h1>
        {!map ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">暂无已发布知识图谱。</p>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <KnowledgeMapGraph nodes={map.nodes} edges={map.edges} />
              <div className="grid gap-4 lg:grid-cols-2">
                {groupedNodes
                  .filter((group) => group.nodes.length > 0)
                  .map((group) => (
                    <article key={group.type} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-semibold text-slate-900">{group.label}</h2>
                        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{group.nodes.length} 项</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {group.nodes.map((node) => (
                          <div key={node.id} className="rounded-xl bg-white px-3 py-2">
                            <p className="text-sm font-medium text-slate-800">{node.label}</p>
                            {node.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{node.summary}</p> : null}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="font-semibold text-slate-900">{map.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{map.summary ?? "课程知识关系。"}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs text-slate-500">节点</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{map.nodes.length}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs text-slate-500">关系</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{map.edges.length}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {relationStats.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                    <span className="text-slate-600">{relationLabels[type] ?? type}</span>
                    <span className="font-semibold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </section>
    </FanyaCourseShell>
  );
}
