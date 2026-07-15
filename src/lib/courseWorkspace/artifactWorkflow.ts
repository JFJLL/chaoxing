import type { AiQuestionPayload, AiPaperPayload } from "@/types/courseWorkspace";
import { parseStoredArtifactPayload } from "@/lib/courseWorkspace/artifactPayload";
import { isServerQuestionKey } from "@/lib/courseWorkspace/questionKeys";
import { normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";

export type ArtifactWorkflowErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_NOT_CONFIRMABLE"
  | "ARTIFACT_CONFIRM_CONFLICT"
  | "ARTIFACT_PUBLISH_CONFLICT"
  | "AI_ARTIFACT_TYPE_NOT_PUBLISHABLE"
  | "DUPLICATE_QUESTION_SOURCE_KEY"
  | "QUESTION_BANK_INSUFFICIENT"
  | "INVALID_PAPER_QUESTIONS"
  | "INVALID_HTML_COURSEWARE_SOURCE";

export class ArtifactWorkflowError extends Error {
  constructor(
    public readonly code: ArtifactWorkflowErrorCode,
    public readonly retryable = false
  ) {
    super(code);
    this.name = "ArtifactWorkflowError";
  }
}

export type ArtifactWorkflowRecord = {
  id: string;
  courseId: string;
  seriesId: string;
  sourceArtifactId: string | null;
  appType: string;
  status: string;
  payload: string | null;
};

export type ApprovedQuestionData = {
  courseId: string;
  createdById: string;
  sourceArtifactId: string;
  sourceSeriesId: string;
  sourceKey: string;
  type: string;
  stem: string;
  options: string | null;
  answer: string;
  explanation: string;
  status: "APPROVED";
  approvedAt: Date;
};

export type ArtifactWorkflowTransaction<Result> = {
  findArtifact(input: { id: string; courseId: string }): Promise<ArtifactWorkflowRecord | null>;
  findApprovedQuestionIds(courseId: string, ids: string[]): Promise<string[]>;
  findSourceCourseware(input: { id: string; courseId: string }): Promise<{ id: string; courseId: string; appType: string; status: string; payload: string | null } | null>;
  approveArtifact(id: string, courseId: string, approvedAt: Date): Promise<number>;
  upsertQuestion(data: ApprovedQuestionData): Promise<void>;
  archiveQuestionsExcept(courseId: string, sourceSeriesId: string, sourceKeys: string[]): Promise<void>;
  archivePublishedInSeries(courseId: string, seriesId: string, exceptId: string): Promise<void>;
  publishArtifact(id: string, courseId: string, publishedAt: Date): Promise<number>;
  findSafeArtifact(id: string, courseId: string): Promise<Result | null>;
};

export type ArtifactWorkflowStore<Result> = {
  transaction(operation: (transaction: ArtifactWorkflowTransaction<Result>) => Promise<Result>): Promise<Result>;
};

function questionEntries(payload: AiQuestionPayload, artifact: ArtifactWorkflowRecord, userId: string, approvedAt: Date) {
  const keys = payload.questions.map((question) => question.id);
  if (keys.some((key) => !isServerQuestionKey(key)) || new Set(keys).size !== keys.length) {
    throw new ArtifactWorkflowError("ARTIFACT_NOT_CONFIRMABLE");
  }
  return payload.questions.map((question, index): ApprovedQuestionData => ({
    courseId: artifact.courseId,
    createdById: userId,
    sourceArtifactId: artifact.id,
    sourceSeriesId: artifact.seriesId,
    sourceKey: keys[index]!,
    type: question.type,
    stem: question.stem,
    options: question.options ? JSON.stringify(question.options) : null,
    answer: question.type === "short_answer"
      ? question.answer
      : normalizeChoiceAnswer(question.answer, question.options ?? [], question.type === "multiple_choice"),
    explanation: question.explanation,
    status: "APPROVED",
    approvedAt
  }));
}

function paperQuestionIds(payload: AiPaperPayload) {
  return payload.sections.flatMap((section) => section.questionIds);
}

export async function confirmArtifact<Result>(
  store: ArtifactWorkflowStore<Result>,
  input: { courseId: string; artifactId: string; userId: string }
) {
  return store.transaction(async (transaction) => {
    const artifact = await transaction.findArtifact({ id: input.artifactId, courseId: input.courseId });
    if (!artifact) throw new ArtifactWorkflowError("ARTIFACT_NOT_FOUND");
    if (artifact.status !== "DRAFT" || !artifact.payload) {
      throw new ArtifactWorkflowError("ARTIFACT_NOT_CONFIRMABLE");
    }
    const payload = parseStoredArtifactPayload(artifact.appType, artifact.payload);
    const approvedAt = new Date();

    let questions: ApprovedQuestionData[] = [];
    if (artifact.appType === "question_generation") {
      questions = questionEntries(payload as AiQuestionPayload, artifact, input.userId, approvedAt);
    } else if (artifact.appType === "paper_assembly") {
      const ids = paperQuestionIds(payload as AiPaperPayload);
      if (new Set(ids).size !== ids.length) {
        throw new ArtifactWorkflowError("INVALID_PAPER_QUESTIONS");
      }
      const approved = await transaction.findApprovedQuestionIds(input.courseId, ids);
      if (approved.length !== ids.length) {
        throw new ArtifactWorkflowError("QUESTION_BANK_INSUFFICIENT");
      }
    } else if (artifact.appType === "html_courseware") {
      const source = artifact.sourceArtifactId
        ? await transaction.findSourceCourseware({ id: artifact.sourceArtifactId, courseId: input.courseId })
        : null;
      if (!source || source.appType !== "courseware" || !["APPROVED", "PUBLISHED"].includes(source.status)) {
        throw new ArtifactWorkflowError("INVALID_HTML_COURSEWARE_SOURCE");
      }
      try {
        parseStoredArtifactPayload("courseware", source.payload);
      } catch {
        throw new ArtifactWorkflowError("INVALID_HTML_COURSEWARE_SOURCE");
      }
    } else if (artifact.appType !== "lesson_plan" && artifact.appType !== "courseware") {
      throw new ArtifactWorkflowError("ARTIFACT_NOT_CONFIRMABLE");
    }

    const transitioned = await transaction.approveArtifact(artifact.id, input.courseId, approvedAt);
    if (transitioned !== 1) {
      throw new ArtifactWorkflowError("ARTIFACT_CONFIRM_CONFLICT", true);
    }
    for (const question of questions) await transaction.upsertQuestion(question);
    if (artifact.appType === "question_generation") {
      await transaction.archiveQuestionsExcept(input.courseId, artifact.seriesId, questions.map((question) => question.sourceKey));
    }
    const result = await transaction.findSafeArtifact(artifact.id, input.courseId);
    if (!result) throw new ArtifactWorkflowError("ARTIFACT_CONFIRM_CONFLICT", true);
    return result;
  });
}

const publishableTypes = new Set(["question_generation", "paper_assembly", "html_courseware"]);

export async function publishArtifact<Result>(
  store: ArtifactWorkflowStore<Result>,
  input: { courseId: string; artifactId: string },
  maxAttempts = 3,
  retryDelayMs = 10
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await store.transaction(async (transaction) => {
    const artifact = await transaction.findArtifact({ id: input.artifactId, courseId: input.courseId });
    if (!artifact) throw new ArtifactWorkflowError("ARTIFACT_NOT_FOUND");
    if (!publishableTypes.has(artifact.appType)) {
      throw new ArtifactWorkflowError("AI_ARTIFACT_TYPE_NOT_PUBLISHABLE");
    }
    if (artifact.status !== "APPROVED") {
      throw new ArtifactWorkflowError("ARTIFACT_PUBLISH_CONFLICT", true);
    }
    await transaction.archivePublishedInSeries(input.courseId, artifact.seriesId, artifact.id);
    const transitioned = await transaction.publishArtifact(artifact.id, input.courseId, new Date());
    if (transitioned !== 1) {
      throw new ArtifactWorkflowError("ARTIFACT_PUBLISH_CONFLICT", true);
    }
    const result = await transaction.findSafeArtifact(artifact.id, input.courseId);
    if (!result) throw new ArtifactWorkflowError("ARTIFACT_PUBLISH_CONFLICT", true);
    return result;
      });
    } catch (error) {
      if (!isRetryablePublicationError(error)) throw error;
      if (attempt === maxAttempts) {
        throw new ArtifactWorkflowError("ARTIFACT_PUBLISH_CONFLICT", true);
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }
  throw new ArtifactWorkflowError("ARTIFACT_PUBLISH_CONFLICT", true);
}

function isRetryablePublicationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (code === "P2002" || code === "P2034") return true;
  const message = error instanceof Error ? error.message : "message" in error ? String(error.message) : "";
  return /SQLITE_BUSY|database (?:is )?locked/i.test(message);
}
