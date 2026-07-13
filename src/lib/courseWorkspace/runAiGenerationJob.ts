import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { AiServiceError, toSafeAiError, type AiErrorCode } from "@/lib/ai/errors";
import { generateCourseAiArtifact, type GenerateCourseAiArtifactInput } from "@/lib/courseWorkspace/generateAiArtifact";
import {
  AiGenerationInputError,
  parseAiGenerationInputSnapshot
} from "@/lib/courseWorkspace/aiGenerationQueue";
import type { CourseAiArtifactPayload } from "@/types/courseWorkspace";
import { normalizeGeneratedArtifactPayload } from "@/lib/courseWorkspace/questionKeys";

type ClaimedArtifact = {
  id: string;
  appType: string;
  inputSnapshot: string | null;
};

export type AiGenerationJobDependencies = {
  claim(artifactId: string, runToken: string): Promise<boolean>;
  readClaimed(artifactId: string, runToken: string): Promise<ClaimedArtifact | null>;
  generate(input: GenerateCourseAiArtifactInput): Promise<CourseAiArtifactPayload>;
  normalize(appType: string, payload: CourseAiArtifactPayload): CourseAiArtifactPayload;
  succeed(artifactId: string, runToken: string, payload: string): Promise<boolean>;
  fail(artifactId: string, runToken: string, code: AiErrorCode, message: string): Promise<boolean>;
};

const defaultDependencies: AiGenerationJobDependencies = {
  async claim(artifactId, runToken) {
    const result = await db.courseAiArtifact.updateMany({
      where: { id: artifactId, status: "QUEUED" },
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
      where: { id: artifactId, status: "GENERATING", runToken },
      select: { id: true, appType: true, inputSnapshot: true }
    });
  },
  generate: generateCourseAiArtifact,
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

  try {
    const input = parseAiGenerationInputSnapshot(artifact.inputSnapshot, artifact.appType);
    const generated = await dependencies.generate(input);
    const payload = dependencies.normalize(artifact.appType, generated);
    await dependencies.succeed(artifactId, runToken, JSON.stringify(payload));
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
    const safe = toSafeAiError(
      error instanceof AiServiceError
        ? error
        : new AiServiceError("MODEL_REQUEST_FAILED", "AI 调用失败，请重试")
    );
    await dependencies.fail(artifactId, runToken, safe.code, safe.message);
  }
}

export function runAiGenerationJob(artifactId: string) {
  return runAiGenerationJobWith(artifactId, defaultDependencies);
}
