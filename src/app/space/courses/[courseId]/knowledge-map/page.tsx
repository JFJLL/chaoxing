import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { KnowledgeMapGraph } from "@/components/course-workspace/KnowledgeMapGraph";

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

  return (
    <FanyaCourseShell user={user} course={course} activeTab="knowledge-map">
      <section className="rounded-[28px] bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">{course.title}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">知识导图</h1>
        {!map ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">暂无已发布知识导图。</p>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <KnowledgeMapGraph nodes={map.nodes} edges={map.edges} />
              {map.nodes.map((node) => (
                <article key={node.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold text-slate-900">{node.label}</h2>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{node.type}</span>
                  </div>
                  {node.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{node.summary}</p> : null}
                </article>
              ))}
            </div>
            <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="font-semibold text-slate-900">{map.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{map.summary ?? "课程知识关系。"}</p>
              <p className="mt-4 text-sm text-slate-500">{map.nodes.length} 个节点，{map.edges.length} 条关系</p>
              <div className="mt-4 space-y-2 text-xs text-slate-500">
                {map.edges.slice(0, 12).map((edge) => (
                  <p key={edge.id} className="rounded-lg bg-white px-3 py-2">{edge.label ?? edge.type}</p>
                ))}
              </div>
            </aside>
          </div>
        )}
      </section>
    </FanyaCourseShell>
  );
}
