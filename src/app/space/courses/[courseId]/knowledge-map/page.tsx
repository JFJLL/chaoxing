import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { KnowledgeMapGraph } from "@/components/course-workspace/KnowledgeMapGraph";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function KnowledgeMapPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const map = await db.courseKnowledgeMap.findFirst({
    where: { courseId, status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      nodes: { orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }] },
      edges: { orderBy: { createdAt: "asc" } }
    }
  });
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
        <header className="flex flex-col gap-5 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">课程内容与知识</h1>
            <p className="mt-1 text-sm text-slate-500">沿着思维导图查看课程目标、章节、课时与教学要点。</p>
          </div>
          <PrepWorkflowNavigation courseId={course.id} workflow="content" active="knowledge-map" />
        </header>
        {!map ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">暂无已发布知识图谱。</p>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <KnowledgeMapGraph
              nodes={map.nodes.map(({ id, label, type, summary, order }) => ({ id, label, type, summary, order }))}
              edges={map.edges.map(({ id, sourceId, targetId, type, label }) => ({ id, sourceId, targetId, type, label }))}
            />
            <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="font-semibold text-slate-900">{map.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{map.summary ?? "课程知识关系。"}</p>
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                左侧集中展示学习目标；右侧按章节逐级展开课时、核心概念、课堂活动与评价。交叉关系收进下方统计，避免连线遮挡内容。
              </div>
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
