import type { AiQuestionPayload, AiPaperPayload } from "@/types/courseWorkspace";
import { parseStoredArtifactPayload } from "@/lib/courseWorkspace/artifactPayload";
import { isServerQuestionKey } from "@/lib/courseWorkspace/questionKeys";
import { normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";

export type ArtifactWorkflowErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_NOT_CONFIRMABLE"
  | "ARTIFACT_CONFIRM_CONFLICT"
  | "ARTIFACT_PUBLISH_CONFLICT"
  | "ARTIFACT_UPDATE_NOT_PENDING"
  | "ARTIFACT_WITHDRAW_CONFLICT"
  | "ARTIFACT_DELETE_REQUIRES_WITHDRAWAL"
  | "ARTIFACT_DELETE_CONFLICT"
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
  publishedPayload?: string | null;
  lockVersion?: number;
  deletedAt?: Date | null;
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
  approveWorkingArtifact?(id: string, courseId: string, approvedAt: Date, expectedLockVersion?: number): Promise<number>;
  publishWorkingArtifact?(id: string, courseId: string, publishedAt: Date, payload: string, expectedLockVersion?: number): Promise<number>;
  confirmPublishedUpdate?(id: string, courseId: string, publishedAt: Date, payload: string, expectedLockVersion: number): Promise<number>;
  withdrawPublishedArtifact?(id: string, courseId: string, withdrawnAt: Date, expectedLockVersion: number): Promise<number>;
  softDeleteArtifact?(id: string, courseId: string, deletedAt: Date, expectedLockVersion: number): Promise<number>;
  findSafeArtifact(id: string, courseId: string): Promise<Result | null>;
};

export type ArtifactWorkflowStore<Result> = {
  transaction<OperationResult>(
    operation: (transaction: ArtifactWorkflowTransaction<Result>) => Promise<OperationResult>
  ): Promise<OperationResult>;
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
  input: { courseId: string; artifactId: string; userId: string; expectedLockVersion?: number }
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
    } else if (
      artifact.appType !== "lesson_plan"
      && artifact.appType !== "courseware"
      && artifact.appType !== "ppt_courseware"
    ) {
      throw new ArtifactWorkflowError("ARTIFACT_NOT_CONFIRMABLE");
    }

    const transitioned = transaction.approveWorkingArtifact
      ? await transaction.approveWorkingArtifact(artifact.id, input.courseId, approvedAt, input.expectedLockVersion)
      : await transaction.approveArtifact(artifact.id, input.courseId, approvedAt);
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

const publishableTypes = new Set([
  "ppt_courseware"
]);

export async function publishArtifact<Result>(
  store: ArtifactWorkflowStore<Result>,
  input: { courseId: string; artifactId: string; expectedLockVersion?: number },
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
    const publishedAt = new Date();
    let transitioned: number;
    if (transaction.publishWorkingArtifact) {
      transitioned = await transaction.publishWorkingArtifact(
        artifact.id,
        input.courseId,
        publishedAt,
        artifact.payload ?? "",
        input.expectedLockVersion
      );
    } else {
      await transaction.archivePublishedInSeries(input.courseId, artifact.seriesId, artifact.id);
      transitioned = await transaction.publishArtifact(artifact.id, input.courseId, publishedAt);
    }
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

async function validateMutablePayload<Result>(
  transaction: ArtifactWorkflowTransaction<Result>,
  artifact: ArtifactWorkflowRecord,
  userId: string,
  approvedAt: Date
) {
  const payload = parseStoredArtifactPayload(artifact.appType, artifact.payload);
  let questions: ApprovedQuestionData[] = [];
  if (artifact.appType === "question_generation") {
    questions = questionEntries(payload as AiQuestionPayload, artifact, userId, approvedAt);
  } else if (artifact.appType === "paper_assembly") {
    const ids = paperQuestionIds(payload as AiPaperPayload);
    if (new Set(ids).size !== ids.length) {
      throw new ArtifactWorkflowError("INVALID_PAPER_QUESTIONS");
    }
    const approved = await transaction.findApprovedQuestionIds(artifact.courseId, ids);
    if (approved.length !== ids.length) {
      throw new ArtifactWorkflowError("QUESTION_BANK_INSUFFICIENT");
    }
  }
  return questions;
}

export async function confirmArtifactUpdate<Result>(
  store: ArtifactWorkflowStore<Result>,
  input: {
    courseId: string;
    artifactId: string;
    userId: string;
    expectedLockVersion: number;
  }
) {
  return store.transaction(async (transaction) => {
    const artifact = await transaction.findArtifact({ id: input.artifactId, courseId: input.courseId });
    if (!artifact || artifact.deletedAt) throw new ArtifactWorkflowError("ARTIFACT_NOT_FOUND");
    if (!publishableTypes.has(artifact.appType)) {
      throw new ArtifactWorkflowError("AI_ARTIFACT_TYPE_NOT_PUBLISHABLE");
    }
    if (
      artifact.status !== "PUBLISHED"
      || !artifact.payload
      || artifact.payload === artifact.publishedPayload
      || !transaction.confirmPublishedUpdate
    ) {
      throw new ArtifactWorkflowError("ARTIFACT_UPDATE_NOT_PENDING");
    }

    const publishedAt = new Date();
    const questions = await validateMutablePayload(transaction, artifact, input.userId, publishedAt);
    const transitioned = await transaction.confirmPublishedUpdate(
      artifact.id,
      input.courseId,
      publishedAt,
      artifact.payload,
      input.expectedLockVersion
    );
    if (transitioned !== 1) {
      throw new ArtifactWorkflowError("ARTIFACT_CONFIRM_CONFLICT", true);
    }
    for (const question of questions) await transaction.upsertQuestion(question);
    if (artifact.appType === "question_generation") {
      await transaction.archiveQuestionsExcept(
        input.courseId,
        artifact.seriesId,
        questions.map((question) => question.sourceKey)
      );
    }
    const result = await transaction.findSafeArtifact(artifact.id, input.courseId);
    if (!result) throw new ArtifactWorkflowError("ARTIFACT_CONFIRM_CONFLICT", true);
    return result;
  });
}

export async function withdrawArtifact<Result>(
  store: ArtifactWorkflowStore<Result>,
  input: { courseId: string; artifactId: string; expectedLockVersion: number }
) {
  return store.transaction(async (transaction) => {
    const artifact = await transaction.findArtifact({ id: input.artifactId, courseId: input.courseId });
    if (!artifact || artifact.deletedAt) throw new ArtifactWorkflowError("ARTIFACT_NOT_FOUND");
    if (!publishableTypes.has(artifact.appType)) {
      throw new ArtifactWorkflowError("AI_ARTIFACT_TYPE_NOT_PUBLISHABLE");
    }
    if (artifact.status !== "PUBLISHED" || !transaction.withdrawPublishedArtifact) {
      throw new ArtifactWorkflowError("ARTIFACT_WITHDRAW_CONFLICT");
    }
    const transitioned = await transaction.withdrawPublishedArtifact(
      artifact.id,
      input.courseId,
      new Date(),
      input.expectedLockVersion
    );
    if (transitioned !== 1) throw new ArtifactWorkflowError("ARTIFACT_WITHDRAW_CONFLICT", true);
    const result = await transaction.findSafeArtifact(artifact.id, input.courseId);
    if (!result) throw new ArtifactWorkflowError("ARTIFACT_WITHDRAW_CONFLICT", true);
    return result;
  });
}

export async function deleteArtifact<Result>(
  store: ArtifactWorkflowStore<Result>,
  input: { courseId: string; artifactId: string; expectedLockVersion: number }
) {
  return store.transaction(async (transaction) => {
    const artifact = await transaction.findArtifact({ id: input.artifactId, courseId: input.courseId });
    if (!artifact || artifact.deletedAt) throw new ArtifactWorkflowError("ARTIFACT_NOT_FOUND");
    if (artifact.status === "PUBLISHED") {
      throw new ArtifactWorkflowError("ARTIFACT_DELETE_REQUIRES_WITHDRAWAL");
    }
    if (!transaction.softDeleteArtifact) {
      throw new ArtifactWorkflowError("ARTIFACT_DELETE_CONFLICT");
    }
    const transitioned = await transaction.softDeleteArtifact(
      artifact.id,
      input.courseId,
      new Date(),
      input.expectedLockVersion
    );
    if (transitioned !== 1) throw new ArtifactWorkflowError("ARTIFACT_DELETE_CONFLICT", true);
    return { id: artifact.id, deleted: true };
  });
}

function isRetryablePublicationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (code === "P2002" || code === "P2034") return true;
  const message = error instanceof Error ? error.message : "message" in error ? String(error.message) : "";
  return /SQLITE_BUSY|database (?:is )?locked/i.test(message);
}
