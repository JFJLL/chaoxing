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

export function buildKnowledgeMapDraft(outline: GeneratedCourseOutline) {
  const nodes: KnowledgeMapNodeDraft[] = [];
  const edges: KnowledgeMapEdgeDraft[] = [];
  const rootId = nodeId();
  const addNode = (node: Omit<KnowledgeMapNodeDraft, "id">) => {
    const id = nodeId();
    nodes.push({ id, ...node });
    return id;
  };
  const addEdge = (edge: KnowledgeMapEdgeDraft) => {
    edges.push(edge);
  };

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

  outline.learningObjectives.forEach((objective, objectiveIndex) => {
    const objectiveId = addNode({
      label: objective,
      type: "objective",
      summary: `课程完成后应能够：${objective}`,
      order: objectiveIndex + 1,
      metadata: JSON.stringify({ courseTitle: outline.title })
    });
    addEdge({
      sourceId: rootId,
      targetId: objectiveId,
      type: "outcome",
      label: "学习目标",
      weight: 1
    });
  });

  let previousChapterId: string | null = null;
  let previousLessonId: string | null = null;

  outline.chapters.forEach((chapter) => {
    const chapterId = addNode({
      label: chapter.title,
      type: "chapter",
      summary: chapter.summary,
      order: chapter.order
    });
    addEdge({
      sourceId: rootId,
      targetId: chapterId,
      type: "contains",
      label: "模块"
    });
    if (previousChapterId) {
      addEdge({
        sourceId: previousChapterId,
        targetId: chapterId,
        type: "precedes",
        label: "后续章节",
        weight: 0.55
      });
    }
    previousChapterId = chapterId;

    chapter.lessons.forEach((lesson) => {
      const lessonId = addNode({
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
      addEdge({
        sourceId: chapterId,
        targetId: lessonId,
        type: "contains",
        label: "课时"
      });
      if (previousLessonId) {
        addEdge({
          sourceId: previousLessonId,
          targetId: lessonId,
          type: "precedes",
          label: "先修",
          weight: 0.45
        });
      }
      previousLessonId = lessonId;

      let previousConceptId: string | null = null;
      const conceptIds: string[] = [];

      lesson.keyPoints.forEach((keyPoint, keyPointIndex) => {
        const conceptId = addNode({
          label: keyPoint,
          type: "concept",
          summary: lesson.summary,
          order: keyPointIndex + 1,
          metadata: JSON.stringify({ lessonTitle: lesson.title })
        });
        conceptIds.push(conceptId);
        addEdge({
          sourceId: lessonId,
          targetId: conceptId,
          type: "contains",
          label: "核心概念",
          weight: 0.9
        });
        if (previousConceptId) {
          addEdge({
            sourceId: previousConceptId,
            targetId: conceptId,
            type: "relates",
            label: "递进",
            weight: 0.35,
            metadata: JSON.stringify({ lessonTitle: lesson.title })
          });
        }
        previousConceptId = conceptId;
      });

      lesson.suggestedActivities.slice(0, 3).forEach((activity, activityIndex) => {
        const activityId = addNode({
          label: activity,
          type: "activity",
          summary: `通过活动巩固“${lesson.title}”。`,
          order: activityIndex + 1,
          metadata: JSON.stringify({ lessonTitle: lesson.title, chapterTitle: chapter.title })
        });
        addEdge({
          sourceId: lessonId,
          targetId: activityId,
          type: "practice",
          label: "实践活动",
          weight: 0.7
        });
        if (conceptIds.length) {
          addEdge({
            sourceId: conceptIds[activityIndex % conceptIds.length],
            targetId: activityId,
            type: "applies",
            label: "应用",
            weight: 0.55
          });
        }
      });

      lesson.assessmentPrompts.slice(0, 2).forEach((assessment, assessmentIndex) => {
        const assessmentId = addNode({
          label: assessment,
          type: "assessment",
          summary: `用于检查“${lesson.title}”的掌握情况。`,
          order: assessmentIndex + 1,
          metadata: JSON.stringify({ lessonTitle: lesson.title, chapterTitle: chapter.title })
        });
        addEdge({
          sourceId: lessonId,
          targetId: assessmentId,
          type: "checks",
          label: "检测",
          weight: 0.7
        });
        if (conceptIds.length) {
          addEdge({
            sourceId: assessmentId,
            targetId: conceptIds[assessmentIndex % conceptIds.length],
            type: "evaluates",
            label: "评价",
            weight: 0.5
          });
        }
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
