import { createHash } from "crypto";
import { db } from "@/lib/db";
import { reserveCreditsInTransaction } from "@/lib/billing/credit-service";
import { createPptImagePagePrompt } from "@/lib/courseWorkspace/generatePptImageCourseware";
import type { AiCoursewarePayload } from "@/types/courseWorkspace";

export async function createPptImageBatch(input: {
  courseId: string;
  userId: string;
  title: string;
  prompt?: string;
  sourceArtifactId: string;
  sourceArtifactVersion: number;
  sourceCourseware: AiCoursewarePayload;
}) {
  const slideCount = input.sourceCourseware.slides.length;
  return db.$transaction(async (tx) => {
    const artifact = await tx.courseAiArtifact.create({
      data: {
        courseId: input.courseId,
        userId: input.userId,
        appType: "ppt_courseware",
        title: input.title,
        prompt: input.prompt,
        payload: null,
        inputSnapshot: JSON.stringify({
          appType: "ppt_courseware",
          sourceCourseware: input.sourceCourseware,
          sourceArtifactId: input.sourceArtifactId,
          sourceArtifactVersion: input.sourceArtifactVersion
        }),
        sourceArtifactId: input.sourceArtifactId,
        status: "QUEUED",
        version: 1
      }
    });
    const batch = await tx.imageGenerationBatch.create({
      data: {
        artifactId: artifact.id,
        userId: input.userId,
        plannedPages: slideCount,
        pages: {
          create: input.sourceCourseware.slides.map((slide, index) => ({
            pageNo: index + 1,
            title: slide.title,
            content: slide.bullets.join("\n"),
            prompt: createPptImagePagePrompt({
              courseTitle: input.title,
              slideNo: index + 1,
              totalSlides: slideCount,
              title: slide.title,
              bullets: slide.bullets,
              speakerNotes: slide.speakerNotes
            }),
            creditReferenceId: `${artifact.id}:page:${index + 1}`
          }))
        }
      }
    });
    await reserveCreditsInTransaction(tx, {
      userId: input.userId,
      amount: slideCount,
      referenceType: "PPT_BATCH",
      referenceId: artifact.id,
      description: `生成 ${slideCount} 页 AI 图像课件，已冻结积分`,
      metadata: { artifactId: artifact.id, batchId: batch.id, pages: slideCount }
    });
    return artifact;
  });
}

export function sourcePayloadHash(payload: AiCoursewarePayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
