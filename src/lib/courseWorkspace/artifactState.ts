export const ARTIFACT_STATUSES = [
  "QUEUED",
  "GENERATING",
  "DRAFT",
  "FAILED",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED"
] as const;

export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

const transitionTargets: Record<ArtifactStatus, readonly ArtifactStatus[]> = {
  QUEUED: ["GENERATING"],
  GENERATING: ["DRAFT", "FAILED"],
  FAILED: ["QUEUED"],
  DRAFT: ["APPROVED", "ARCHIVED"],
  APPROVED: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: []
};

const editableStatuses = new Set<ArtifactStatus>(["DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"]);
const statusSet = new Set<string>(ARTIFACT_STATUSES);

export function parseArtifactStatus(value: unknown): ArtifactStatus | null {
  return typeof value === "string" && statusSet.has(value) ? value as ArtifactStatus : null;
}

export function canArtifactTransition(from: ArtifactStatus, to: ArtifactStatus) {
  return transitionTargets[from].includes(to);
}

export function assertArtifactTransition(from: ArtifactStatus, to: ArtifactStatus) {
  if (!canArtifactTransition(from, to)) {
    throw new Error(`Illegal artifact transition: ${from} -> ${to}`);
  }
}

export function isArtifactTerminal(status: ArtifactStatus) {
  return status !== "QUEUED" && status !== "GENERATING";
}

export function getArtifactPollDelay(status: ArtifactStatus) {
  return isArtifactTerminal(status) ? null : 1500;
}

export type ArtifactRevisionSource = {
  id: string;
  seriesId: string;
  courseId: string;
  userId: string;
  appType: string;
  title: string;
  prompt: string | null;
  payload: string | null;
  inputSnapshot: string | null;
  scope: string | null;
  sourceJobId: string | null;
  status: ArtifactStatus;
  version: number;
};

export function nextArtifactRevision(source: ArtifactRevisionSource, seriesMaxVersion: number) {
  if (!source.payload || !editableStatuses.has(source.status)) {
    throw new Error("Only materialized artifact revisions can be edited");
  }
  if (!Number.isInteger(seriesMaxVersion) || seriesMaxVersion < source.version) {
    throw new Error("Artifact series maximum version is invalid");
  }

  return {
    courseId: source.courseId,
    userId: source.userId,
    appType: source.appType,
    title: source.title,
    prompt: source.prompt,
    payload: source.payload,
    inputSnapshot: source.inputSnapshot,
    scope: source.scope,
    sourceJobId: source.sourceJobId,
    sourceArtifactId: source.id,
    seriesId: source.seriesId,
    version: seriesMaxVersion + 1,
    status: "DRAFT" as const
  };
}
