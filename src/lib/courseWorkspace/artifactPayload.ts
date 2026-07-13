import { z } from "zod";
import {
  aiCoursewarePayloadSchema,
  aiLessonPlanPayloadSchema,
  aiPaperPayloadSchema,
  aiQuestionPayloadSchema,
  htmlCoursewarePayloadSchema,
  type CourseAiAppType,
  type CourseAiArtifactPayload
} from "@/types/courseWorkspace";
import {
  normalizeEditedQuestionPayload,
  type QuestionKeyAllocator
} from "@/lib/courseWorkspace/questionKeys";

export type ArtifactPayloadErrorCode =
  | "ARTIFACT_EDIT_BODY_INVALID"
  | "ARTIFACT_APP_TYPE_INVALID"
  | "ARTIFACT_PAYLOAD_INVALID"
  | "ARTIFACT_HTML_EDIT_FORBIDDEN"
  | "ARTIFACT_QUESTION_ID_INVALID";

export class ArtifactPayloadError extends Error {
  constructor(public readonly code: ArtifactPayloadErrorCode) {
    super(code);
    this.name = "ArtifactPayloadError";
  }
}

const editBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  payload: z.unknown()
}).strict();

const payloadSchemas: Record<CourseAiAppType, z.ZodType<CourseAiArtifactPayload>> = {
  question_generation: aiQuestionPayloadSchema,
  lesson_plan: aiLessonPlanPayloadSchema,
  courseware: aiCoursewarePayloadSchema,
  paper_assembly: aiPaperPayloadSchema,
  html_courseware: htmlCoursewarePayloadSchema
};

export function parseCourseAiAppType(value: string): CourseAiAppType {
  if (value in payloadSchemas) return value as CourseAiAppType;
  throw new ArtifactPayloadError("ARTIFACT_APP_TYPE_INVALID");
}

export function parseArtifactPayload(appType: string, value: unknown): CourseAiArtifactPayload {
  const type = parseCourseAiAppType(appType);
  const parsed = payloadSchemas[type].safeParse(value);
  if (!parsed.success) throw new ArtifactPayloadError("ARTIFACT_PAYLOAD_INVALID");
  return parsed.data;
}

export function parseStoredArtifactPayload(appType: string, payload: string | null) {
  if (!payload) throw new ArtifactPayloadError("ARTIFACT_PAYLOAD_INVALID");
  try {
    return parseArtifactPayload(appType, JSON.parse(payload));
  } catch (error) {
    if (error instanceof ArtifactPayloadError) throw error;
    throw new ArtifactPayloadError("ARTIFACT_PAYLOAD_INVALID");
  }
}

export function parseArtifactEditBody(
  appType: string,
  body: unknown,
  options: { sourcePayload?: string | null; allocateQuestionKey?: QuestionKeyAllocator } = {}
) {
  if (appType === "html_courseware") {
    throw new ArtifactPayloadError("ARTIFACT_HTML_EDIT_FORBIDDEN");
  }
  const parsedBody = editBodySchema.safeParse(body);
  if (!parsedBody.success) throw new ArtifactPayloadError("ARTIFACT_EDIT_BODY_INVALID");
  let payload = parseArtifactPayload(appType, parsedBody.data.payload);
  if (appType === "question_generation") {
    if (!options.sourcePayload) throw new ArtifactPayloadError("ARTIFACT_PAYLOAD_INVALID");
    const source = parseStoredArtifactPayload(appType, options.sourcePayload);
    try {
      payload = normalizeEditedQuestionPayload(
        source as Extract<CourseAiArtifactPayload, { questions: unknown }>,
        payload as Extract<CourseAiArtifactPayload, { questions: unknown }>,
        options.allocateQuestionKey
      );
    } catch {
      throw new ArtifactPayloadError("ARTIFACT_QUESTION_ID_INVALID");
    }
  }
  return { title: parsedBody.data.title, payload: JSON.stringify(payload) };
}
