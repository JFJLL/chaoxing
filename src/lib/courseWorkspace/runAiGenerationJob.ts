import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { AiServiceError, toSafeAiError, type AiErrorCode } from "@/lib/ai/errors";
import {
  CourseAiArtifactGenerationError,
  generateCourseAiArtifactWithUsage,
  type CourseAiUsageCapture,
  type GeneratedCourseAiArtifact,
  type GenerateCourseAiArtifactInput
} from "@/lib/courseWorkspace/generateAiArtifact";
import {
  AiGenerationInputError,
  parseAiGenerationInputSnapshot
} from "@/lib/courseWorkspace/aiGenerationQueue";
import type { CourseAiArtifactPayload } from "@/types/courseWorkspace";
import { normalizeGeneratedArtifactPayload } from "@/lib/courseWorkspace/questionKeys";
import { generatePptImageCourseware } from "@/lib/courseWorkspace/generatePptImageCourseware";

type ClaimedArtifact = {
  id: string;
  courseId: string;
  userId: string;
  appType: string;
  inputSnapshot: string | null;
};

export type AiGenerationJobDependencies = {
  claim(artifactId: string, runToken: string): Promise<boolean>;
  readClaimed(artifactId: string, runToken: string): Promise<ClaimedArtifact | null>;
  generate(input: GenerateCourseAiArtifactInput): Promise<GeneratedCourseAiArtifact>;
  normalize(appType: string, payload: CourseAiArtifactPayload): CourseAiArtifactPayload;
  succeed(artifactId: string, runToken: string, payload: string): Promise<boolean>;
  fail(artifactId: string, runToken: string, code: AiErrorCode, message: string): Promise<boolean>;
  recordUsage?(artifact: ClaimedArtifact, input: GenerateCourseAiArtifactInput, usageCapture: CourseAiUsageCapture | null, status: "SUCCESS" | "FAILED"): Promise<void>;
};

const defaultDependencies: AiGenerationJobDependencies = {
  async claim(artifactId, runToken) {
    const result = await db.courseAiArtifact.updateMany({
      where: { id: artifactId, status: "QUEUED", deletedAt: null },
      data: {
        status: "GENERATING",
        payload: null,
        errorCode: null,
        errorMessage: null,
        runToken,
        startedAt: new Date(),
        finishedAt: null
      }
    });
    return result.count === 1;
  },
  readClaimed(artifactId, runToken) {
    return db.courseAiArtifact.findFirst({
      where: { id: artifactId, status: "GENERATING", runToken, deletedAt: null },
      select: { id: true, courseId: true, userId: true, appType: true, inputSnapshot: true }
    });
  },
  generate: generateCourseAiArtifactWithUsage,
  normalize: normalizeGeneratedArtifactPayload,
  async succeed(artifactId, runToken, payload) {
    const result = await db.courseAiArtifact.updateMany({
      where: { id: artifactId, status: "GENERATING", runToken },
      data: {
        status: "DRAFT",
        payload,
        errorCode: null,
        errorMessage: null,
        runToken: null,
        finishedAt: new Date()
      }
    });
    return result.count === 1;
  },
  async fail(artifactId, runToken, code, message) {
    const result = await db.courseAiArtifact.updateMany({
      where: { id: artifactId, status: "GENERATING", runToken },
      data: {
        status: "FAILED",
        payload: null,
        errorCode: code,
        errorMessage: message,
        runToken: null,
        finishedAt: new Date()
      }
    });
    return result.count === 1;
  },
  async recordUsage(artifact, input, usageCapture, status) {
    const hasCompleteProviderUsage = Boolean(usageCapture?.tokenUsageComplete && usageCapture.tokenUsage.length);
    const totals = hasCompleteProviderUsage
      ? usageCapture!.tokenUsage.reduce((sum, usage) => ({
          promptTokens: sum.promptTokens + usage.promptTokens,
          completionTokens: sum.completionTokens + usage.completionTokens,
          totalTokens: sum.totalTokens + usage.totalTokens
        }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 })
      : null;
    const firstUsage = usageCapture?.tokenUsage[0] ?? null;
    await db.copilotUsageEvent.create({
      data: {
        courseId: artifact.courseId,
        userId: artifact.userId,
        status: artifact.appType === "ppt_courseware" ? (status === "SUCCESS" ? "IMAGE_SUCCESS" : "IMAGE_FAILED") : status,
        imageCount: artifact.appType === "ppt_courseware" ? input.sourceCourseware?.slides.length ?? 0 : 0,
        tokenUsageSource: totals ? "PROVIDER" : "UNAVAILABLE",
        tokenUsageProvider: totals ? firstUsage?.provider ?? null : null,
        tokenUsageModel: totals ? firstUsage?.model ?? null : null,
        promptTokensActual: totals?.promptTokens ?? 0,
        completionTokensActual: totals?.completionTokens ?? 0,
        totalTokensActual: totals?.totalTokens ?? 0,
        completedAt: new Date()
      }
    });
  }
};

export async function runAiGenerationJobWith(
  artifactId: string,
  dependencies: AiGenerationJobDependencies,
  runToken: string = randomUUID()
) {
  const claimed = await dependencies.claim(artifactId, runToken);
  if (!claimed) return;

  const artifact = await dependencies.readClaimed(artifactId, runToken);
  if (!artifact) return;

  let input: GenerateCourseAiArtifactInput | null = null;
  try {
    input = parseAiGenerationInputSnapshot(artifact.inputSnapshot, artifact.appType);
    if (artifact.appType === "ppt_courseware") {
      if (!input.sourceCourseware) throw new AiGenerationInputError();
      const payload = await generatePptImageCourseware({ artifactId, sourceCourseware: input.sourceCourseware });
      await dependencies.succeed(artifactId, runToken, JSON.stringify(payload));
      await dependencies.recordUsage?.(artifact, input, null, "SUCCESS");
      return;
    }
      const generated = await dependencies.generate(input);
      const payload = dependencies.normalize(artifact.appType, generated.payload);
      await dependencies.succeed(artifactId, runToken, JSON.stringify(payload));
      await dependencies.recordUsage?.(artifact, input, generated, "SUCCESS");
  } catch (error) {
    if (error instanceof AiGenerationInputError) {
      await dependencies.fail(
        artifactId,
        runToken,
        "MODEL_INVALID_OUTPUT",
        "AI 生成任务输入无效，请重新发起生成"
      );
      return;
    }
    const usageCapture = error instanceof CourseAiArtifactGenerationError ? error.usageCapture : null;
    const safe = toSafeAiError(
      error instanceof AiServiceError
        ? error
        : new AiServiceError("MODEL_REQUEST_FAILED", "AI 调用失败，请重试")
    );
    await dependencies.fail(artifactId, runToken, safe.code, safe.message);
    if (input) await dependencies.recordUsage?.(artifact, input, usageCapture, "FAILED");
  }
}

export function runAiGenerationJob(artifactId: string) {
  return runAiGenerationJobWith(artifactId, defaultDependencies);
}
