import { randomUUID } from "crypto";
import type { AiQuestionPayload, CourseAiArtifactPayload } from "@/types/courseWorkspace";

export class QuestionKeyError extends Error {
  readonly code = "ARTIFACT_QUESTION_ID_INVALID";

  constructor() {
    super("ARTIFACT_QUESTION_ID_INVALID");
    this.name = "QuestionKeyError";
  }
}

export type QuestionKeyAllocator = () => string;

const serverQuestionKeyPattern = /^question_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isServerQuestionKey(value: unknown): value is string {
  return typeof value === "string" && serverQuestionKeyPattern.test(value);
}

function allocateKey(allocate: QuestionKeyAllocator, used: Set<string>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const key = `question_${allocate()}`;
    if (isServerQuestionKey(key) && !used.has(key)) {
      used.add(key);
      return key;
    }
  }
  throw new QuestionKeyError();
}

export function normalizeGeneratedArtifactPayload(
  appType: string,
  payload: CourseAiArtifactPayload,
  allocate: QuestionKeyAllocator = randomUUID
): CourseAiArtifactPayload {
  if (appType !== "question_generation") return payload;
  const used = new Set<string>();
  const questions = (payload as AiQuestionPayload).questions.map((question) => ({
    ...question,
    id: allocateKey(allocate, used)
  }));
  return { questions };
}

export function normalizeEditedQuestionPayload(
  source: AiQuestionPayload,
  edited: AiQuestionPayload,
  allocate: QuestionKeyAllocator = randomUUID
): AiQuestionPayload {
  const inherited = new Set(
    source.questions.map((question) => question.id).filter(isServerQuestionKey)
  );
  const used = new Set<string>();
  const reserved = new Set(inherited);
  const questions = edited.questions.map((question) => {
    if (question.id) {
      if (!isServerQuestionKey(question.id) || !inherited.has(question.id) || used.has(question.id)) {
        throw new QuestionKeyError();
      }
      used.add(question.id);
      return question;
    }
    return { ...question, id: allocateKey(allocate, reserved) };
  });
  return { questions };
}
