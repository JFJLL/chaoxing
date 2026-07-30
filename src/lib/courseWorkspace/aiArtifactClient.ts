import type { CourseAiAppType } from "@/types/courseWorkspace";

export const AI_ARTIFACT_STATUSES = [
  "QUEUED",
  "GENERATING",
  "DRAFT",
  "FAILED",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED"
] as const;

export type AiArtifactStatus = (typeof AI_ARTIFACT_STATUSES)[number];

export type ManagerAiArtifactDto = {
  id: string;
  seriesId: string;
  appType: CourseAiAppType;
  title: string;
  prompt: string | null;
  payload: string | null;
  publishedPayload?: string | null;
  scope: string | null;
  status: AiArtifactStatus;
  version: number;
  errorCode: string | null;
  errorMessage: string | null;
  sourceJobId: string | null;
  sourceArtifactId: string | null;
  jobsAhead: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  withdrawnAt?: string | null;
  deletedAt?: string | null;
  lockVersion?: number;
  createdAt: string;
  updatedAt: string;
};

export type AiArtifactScope =
  | { kind: "course" }
  | { kind: "chapter"; chapterId: string };

export type CreateAiArtifactInput = {
  courseId: string;
  appType: CourseAiAppType;
  prompt: string;
  title: string;
  scope: AiArtifactScope;
  sourceArtifactId?: string;
  sourceSelections?: Array<{ documentId: string; sectionIds: string[] }>;
  slideCountPlan?: {
    requestedSlideCount: number;
    recommendedSlideCount: number | null;
    recommendationAccepted: boolean;
    sourceArtifactId: string;
    sourceArtifactVersion: number | null;
  };
};

export type RequestLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const appTypes = new Set<CourseAiAppType>([
  "question_generation",
  "lesson_plan",
  "courseware",
  "paper_assembly",
  "ppt_courseware",
  "html_courseware"
]);
const statuses = new Set<string>(AI_ARTIFACT_STATUSES);

export class AiArtifactRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "AiArtifactRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isDateString(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isNullableDateString(value: unknown): value is string | null {
  return value === null || isDateString(value);
}

function invalidDto(): never {
  throw new AiArtifactRequestError("AI_RESPONSE_INVALID", "AI 返回结果无效，请重试", null, true);
}

export function parseManagerAiArtifactDto(value: unknown): ManagerAiArtifactDto {
  if (!isRecord(value)) return invalidDto();
  const status = value.status;
  const appType = value.appType;
  const publishedPayload = value.publishedPayload === undefined ? null : value.publishedPayload;
  const withdrawnAt = value.withdrawnAt === undefined ? null : value.withdrawnAt;
  const deletedAt = value.deletedAt === undefined ? null : value.deletedAt;
  const lockVersion = value.lockVersion === undefined ? 0 : value.lockVersion;
  if (
    typeof value.id !== "string" || !value.id
    || typeof value.seriesId !== "string" || !value.seriesId
    || typeof appType !== "string" || !appTypes.has(appType as CourseAiAppType)
    || typeof value.title !== "string" || !value.title.trim()
    || !isNullableString(value.prompt)
    || !isNullableString(value.payload)
    || !isNullableString(publishedPayload)
    || !isNullableString(value.scope)
    || typeof status !== "string" || !statuses.has(status)
    || !Number.isInteger(value.version) || (value.version as number) < 1
    || !isNullableString(value.errorCode)
    || !isNullableString(value.errorMessage)
    || !isNullableString(value.sourceJobId)
    || !isNullableString(value.sourceArtifactId)
    || !(value.jobsAhead === null || (Number.isInteger(value.jobsAhead) && (value.jobsAhead as number) >= 0))
    || !isNullableDateString(value.startedAt)
    || !isNullableDateString(value.finishedAt)
    || !isNullableDateString(value.approvedAt)
    || !isNullableDateString(value.publishedAt)
    || !isNullableDateString(withdrawnAt)
    || !isNullableDateString(deletedAt)
    || !Number.isInteger(lockVersion) || (lockVersion as number) < 0
    || !isDateString(value.createdAt)
    || !isDateString(value.updatedAt)
  ) return invalidDto();

  return {
    id: value.id,
    seriesId: value.seriesId,
    appType: appType as CourseAiAppType,
    title: value.title,
    prompt: value.prompt,
    payload: value.payload,
    ...("publishedPayload" in value ? { publishedPayload } : {}),
    scope: value.scope,
    status: status as AiArtifactStatus,
    version: value.version as number,
    errorCode: value.errorCode,
    errorMessage: value.errorMessage,
    sourceJobId: value.sourceJobId,
    sourceArtifactId: value.sourceArtifactId,
    jobsAhead: value.jobsAhead as number | null,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    approvedAt: value.approvedAt,
    publishedAt: value.publishedAt,
    ...("withdrawnAt" in value ? { withdrawnAt } : {}),
    ...("deletedAt" in value ? { deletedAt } : {}),
    ...("lockVersion" in value ? { lockVersion: lockVersion as number } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

async function requestArtifact(url: string, init: RequestInit | undefined, request: RequestLike) {
  let response: Response;
  try {
    response = await request(url, init);
  } catch {
    throw new AiArtifactRequestError("AI_NETWORK_ERROR", "网络连接失败，请重试", null, true);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = isRecord(body) ? body : null;
    const code = typeof errorBody?.code === "string" && errorBody.code ? errorBody.code : "AI_REQUEST_FAILED";
    const message = typeof errorBody?.error === "string" && errorBody.error.trim()
      ? errorBody.error
      : "AI 调用失败，请重试";
    throw new AiArtifactRequestError(
      code,
      message,
      response.status,
      typeof errorBody?.retryable === "boolean" ? errorBody.retryable : response.status >= 500
    );
  }
  if (!isRecord(body) || !("artifact" in body)) return invalidDto();
  return parseManagerAiArtifactDto(body.artifact);
}

function jsonInit(method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      };
}

export function createCourseAiArtifact(input: CreateAiArtifactInput, request: RequestLike = fetch) {
  return requestArtifact(`/api/courses/${input.courseId}/ai-apps`, jsonInit("POST", {
    appType: input.appType,
    prompt: input.prompt,
    title: input.title,
    scope: input.scope,
    sourceArtifactId: input.sourceArtifactId,
    sourceSelections: input.sourceSelections,
    slideCountPlan: input.slideCountPlan
  }), request);
}

export const requestCourseAiArtifact = createCourseAiArtifact;

export function getCourseAiArtifact(courseId: string, artifactId: string, request: RequestLike = fetch) {
  return requestArtifact(`/api/courses/${courseId}/ai-artifacts/${artifactId}`, undefined, request);
}

export function retryCourseAiArtifact(courseId: string, artifactId: string, request: RequestLike = fetch) {
  return requestArtifact(`/api/courses/${courseId}/ai-artifacts/${artifactId}/retry`, jsonInit("POST"), request);
}

export function saveCourseAiArtifactRevision(
  courseId: string,
  artifactId: string,
  body: { title: string; payload: unknown; lockVersion?: number },
  request: RequestLike = fetch
) {
  return requestArtifact(`/api/courses/${courseId}/ai-artifacts/${artifactId}`, jsonInit("PUT", body), request);
}

// Renames an AI artifact in place (label only); does not create a new revision.
export function renameCourseAiArtifact(
  courseId: string,
  artifactId: string,
  title: string,
  request: RequestLike = fetch
) {
  return requestArtifact(`/api/courses/${courseId}/ai-artifacts/${artifactId}`, jsonInit("PATCH", { title }), request);
}

export function confirmCourseAiArtifact(
  courseId: string,
  artifactId: string,
  expectedLockVersionOrRequest?: number | RequestLike,
  request: RequestLike = fetch
) {
  const expectedLockVersion = typeof expectedLockVersionOrRequest === "number" ? expectedLockVersionOrRequest : undefined;
  const requester = typeof expectedLockVersionOrRequest === "function" ? expectedLockVersionOrRequest : request;
  return requestArtifact(
    `/api/courses/${courseId}/ai-artifacts/${artifactId}/confirm`,
    jsonInit("POST", expectedLockVersion === undefined ? undefined : { lockVersion: expectedLockVersion }),
    requester
  );
}

export function publishCourseAiArtifact(
  courseId: string,
  artifactId: string,
  expectedLockVersionOrRequest?: number | RequestLike,
  request: RequestLike = fetch
) {
  const expectedLockVersion = typeof expectedLockVersionOrRequest === "number" ? expectedLockVersionOrRequest : undefined;
  const requester = typeof expectedLockVersionOrRequest === "function" ? expectedLockVersionOrRequest : request;
  return requestArtifact(
    `/api/courses/${courseId}/ai-artifacts/${artifactId}/publish`,
    jsonInit("POST", expectedLockVersion === undefined ? undefined : { lockVersion: expectedLockVersion }),
    requester
  );
}

export function confirmCourseAiArtifactUpdate(
  courseId: string,
  artifactId: string,
  lockVersion: number,
  request: RequestLike = fetch
) {
  return requestArtifact(
    `/api/courses/${courseId}/ai-artifacts/${artifactId}/confirm-update`,
    jsonInit("POST", { lockVersion }),
    request
  );
}

export function withdrawCourseAiArtifact(
  courseId: string,
  artifactId: string,
  lockVersion: number,
  request: RequestLike = fetch
) {
  return requestArtifact(
    `/api/courses/${courseId}/ai-artifacts/${artifactId}/withdraw`,
    jsonInit("POST", { lockVersion }),
    request
  );
}

export async function deleteCourseAiArtifact(
  courseId: string,
  artifactId: string,
  lockVersion: number,
  request: RequestLike = fetch
) {
  const response = await request(
    `/api/courses/${courseId}/ai-artifacts/${artifactId}`,
    jsonInit("DELETE", { lockVersion })
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = isRecord(body) ? body : null;
    throw new AiArtifactRequestError(
      typeof errorBody?.code === "string" ? errorBody.code : "AI_REQUEST_FAILED",
      typeof errorBody?.error === "string" ? errorBody.error : "删除失败，请重试",
      response.status,
      response.status >= 500
    );
  }
  if (!isRecord(body) || body.deleted !== true) return invalidDto();
  return { deleted: true as const };
}

export function isActiveAiArtifact(artifact: Pick<ManagerAiArtifactDto, "status">) {
  return artifact.status === "QUEUED" || artifact.status === "GENERATING";
}

export async function pollCourseAiArtifactUntilTerminal({
  courseId,
  artifactId,
  request = fetch,
  wait = (delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay)),
  onUpdate = () => undefined
}: {
  courseId: string;
  artifactId: string;
  request?: RequestLike;
  wait?: (delay: number) => Promise<void>;
  onUpdate?: (artifact: ManagerAiArtifactDto) => void;
}) {
  for (;;) {
    const artifact = await getCourseAiArtifact(courseId, artifactId, request);
    onUpdate(artifact);
    if (!isActiveAiArtifact(artifact)) return artifact;
    await wait(1500);
  }
}
