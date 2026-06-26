import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import type { GeneratedCourseOutline } from "@/types/course";
import { db } from "@/lib/db";

type KnowledgeMapNodeDraft = {
  id: string;
  label: string;
  type: string;
  summary?: string | null;
  order: number;
  metadata?: string | null;
};

type KnowledgeMapEdgeDraft = {
  sourceId: string;
  targetId: string;
  type: string;
  label?: string | null;
  weight?: number | null;
  metadata?: string | null;
};

function nodeId() {
  return randomUUID();
}

function buildKnowledgeMapDraft(outline: GeneratedCourseOutline) {
  const nodes: KnowledgeMapNodeDraft[] = [];
  const edges: KnowledgeMapEdgeDraft[] = [];
  const rootId = nodeId();

  nodes.push({
    id: rootId,
    label: outline.title,
    type: "course",
    summary: outline.description,
    order: 0,
    metadata: JSON.stringify({
      targetAudience: outline.targetAudience,
      learningObjectives: outline.learningObjectives
    })
  });

  outline.chapters.forEach((chapter) => {
    const chapterId = nodeId();
    nodes.push({
      id: chapterId,
      label: chapter.title,
      type: "chapter",
      summary: chapter.summary,
      order: chapter.order
    });
    edges.push({
      sourceId: rootId,
      targetId: chapterId,
      type: "contains",
      label: "包含"
    });

    chapter.lessons.forEach((lesson) => {
      const lessonId = nodeId();
      nodes.push({
        id: lessonId,
        label: lesson.title,
        type: "lesson",
        summary: lesson.summary,
        order: lesson.order,
        metadata: JSON.stringify({
          estimatedMinutes: lesson.estimatedMinutes,
          activities: lesson.suggestedActivities,
          assessments: lesson.assessmentPrompts
        })
      });
      edges.push({
        sourceId: chapterId,
        targetId: lessonId,
        type: "contains",
        label: "包含"
      });

      lesson.keyPoints.forEach((keyPoint, keyPointIndex) => {
        const conceptId = nodeId();
        nodes.push({
          id: conceptId,
          label: keyPoint,
          type: "concept",
          summary: lesson.summary,
          order: keyPointIndex + 1,
          metadata: JSON.stringify({ lessonTitle: lesson.title })
        });
        edges.push({
          sourceId: lessonId,
          targetId: conceptId,
          type: "contains",
          label: "知识点"
        });
      });
    });
  });

  return { nodes, edges };
}

export async function createKnowledgeMapDraft({
  courseId,
  sourceJobId,
  outline,
  tx = db
}: {
  courseId: string;
  sourceJobId?: string;
  outline: GeneratedCourseOutline;
  tx?: Prisma.TransactionClient | typeof db;
}) {
  const draft = buildKnowledgeMapDraft(outline);
  const map = await tx.courseKnowledgeMap.create({
    data: {
      courseId,
      sourceJobId,
      title: `${outline.title} 知识导图`,
      summary: outline.description,
      status: "DRAFT",
      version: 1
    }
  });

  await tx.knowledgeNode.createMany({
    data: draft.nodes.map((node) => ({
      ...node,
      mapId: map.id
    }))
  });
  await tx.knowledgeEdge.createMany({
    data: draft.edges.map((edge) => ({
      ...edge,
      mapId: map.id
    }))
  });

  return tx.courseKnowledgeMap.findUniqueOrThrow({
    where: { id: map.id },
    include: { nodes: true, edges: true }
  });
}
