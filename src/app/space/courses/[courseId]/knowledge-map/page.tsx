import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { PrepWorkflowNavigation } from "@/components/course-workspace/PrepWorkflowNavigation";
import { KnowledgeMapWorkspace } from "@/components/course-workspace/KnowledgeMapWorkspace";
import { composePublishedKnowledgeMaps, PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES } from "@/lib/knowledgeMap/knowledgeMapService";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function KnowledgeMapPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const rows = await db.courseKnowledgeMap.findMany({
    where: {
      courseId,
      status: "PUBLISHED",
      deletedAt: null,
      OR: [
        { sourceJobId: { not: null }, sourceJob: { deletedAt: null, status: { in: PUBLISHED_KNOWLEDGE_MAP_SOURCE_STATUSES } } },
        { selectionKey: { not: null }, sourceMapIds: { not: null } }
      ]
    },
    orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
    include: { sourceJob: { select: { id: true, originalName: true } } }
  });
  const latestByDocument = new Map<string, typeof rows[number]>();
  for (const row of rows) if (row.sourceJobId && !latestByDocument.has(row.sourceJobId)) latestByDocument.set(row.sourceJobId, row);
  const documents = [...latestByDocument.values()];
  const latestByComposite = new Map<string, typeof rows[number]>();
  for (const row of rows) if (row.selectionKey && row.sourceMapIds && !latestByComposite.has(row.selectionKey)) latestByComposite.set(row.selectionKey, row);
  const savedComposites = [...latestByComposite.values()].flatMap((row) => {
    try {
      const sourceMapIds = JSON.parse(row.sourceMapIds!) as unknown;
      return Array.isArray(sourceMapIds) && sourceMapIds.every((id) => typeof id === "string")
        ? [{ mapId: row.id, title: row.title, version: row.version, publishedAt: row.publishedAt!.toISOString(), sourceMapIds }]
        : [];
    } catch {
      return [];
    }
  });
  const initial = documents[0] ? await composePublishedKnowledgeMaps({ courseId, courseTitle: course.title, mapIds: [documents[0].id], persist: false }) : null;

  return (
    <FanyaCourseShell user={user} course={course} activeTab="knowledge-map">
      <section className="rounded-[28px] bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-5 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div><h1 className="text-2xl font-semibold text-slate-900">课程内容与知识</h1><p className="mt-1 text-sm text-slate-500">按文档切换或组合查看课程目标、章节、课时与教学要点。</p></div>
          {canManage ? <PrepWorkflowNavigation courseId={course.id} workflow="content" active="knowledge-map" /> : null}
        </header>
        {!initial ? <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">暂无已发布知识图谱。</p> : (
          <KnowledgeMapWorkspace
            courseId={courseId}
            canManage={canManage}
            documents={documents.map((document) => ({ mapId: document.id, sourceJobId: document.sourceJobId!, name: document.sourceJob!.originalName, version: document.version, publishedAt: document.publishedAt!.toISOString() }))}
            savedComposites={savedComposites}
            initialMap={{ id: initial.map.id, title: initial.map.title, summary: initial.map.summary, version: initial.map.version, textContent: initial.map.textContent, nodes: initial.map.nodes.map(({ id, label, type, summary, order }) => ({ id, label, type, summary, order })), edges: initial.map.edges.map(({ id, sourceId, targetId, type, label }) => ({ id, sourceId, targetId, type, label })) }}
            initialEditTargetId={documents[0].id}
          />
        )}
      </section>
    </FanyaCourseShell>
  );
}
