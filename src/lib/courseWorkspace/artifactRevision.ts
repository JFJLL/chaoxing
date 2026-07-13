import {
  nextArtifactRevision,
  parseArtifactStatus,
  type ArtifactRevisionSource
} from "@/lib/courseWorkspace/artifactState";

export type ArtifactRevisionErrorCode =
  | "ARTIFACT_SOURCE_NOT_FOUND"
  | "ARTIFACT_PAYLOAD_REQUIRED"
  | "ARTIFACT_SOURCE_NOT_EDITABLE"
  | "ARTIFACT_REVISION_CONFLICT";

export class ArtifactRevisionError extends Error {
  constructor(
    public readonly code: ArtifactRevisionErrorCode,
    public readonly retryable = false
  ) {
    super(code);
    this.name = "ArtifactRevisionError";
  }
}

export type ArtifactRevisionSourceRecord = Omit<ArtifactRevisionSource, "status"> & {
  status: string;
};

export type ArtifactRevisionCreateData = ReturnType<typeof nextArtifactRevision>;

export type ArtifactRevisionTransaction<Result> = {
  findSourceByCourse(input: { id: string; courseId: string }): Promise<ArtifactRevisionSourceRecord | null>;
  findSeriesMaxVersion(input: { courseId: string; seriesId: string }): Promise<number | null>;
  create(data: ArtifactRevisionCreateData): Promise<Result>;
};

export type ArtifactRevisionStore<Result> = {
  transaction(operation: (transaction: ArtifactRevisionTransaction<Result>) => Promise<Result>): Promise<Result>;
};

export type CreateArtifactRevisionInput = {
  courseId: string;
  sourceArtifactId: string;
  userId: string;
  title: string;
  payload: string;
};

const editableStatuses = new Set(["DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"]);

function isPrismaUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function createArtifactRevision<Result>(
  store: ArtifactRevisionStore<Result>,
  input: CreateArtifactRevisionInput,
  maxAttempts = 3
): Promise<Result> {
  if (!input.payload.trim()) {
    throw new ArtifactRevisionError("ARTIFACT_PAYLOAD_REQUIRED");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await store.transaction(async (transaction) => {
        const source = await transaction.findSourceByCourse({
          id: input.sourceArtifactId,
          courseId: input.courseId
        });
        if (!source) {
          throw new ArtifactRevisionError("ARTIFACT_SOURCE_NOT_FOUND");
        }

        const status = parseArtifactStatus(source.status);
        if (!status || !editableStatuses.has(status) || !source.payload) {
          throw new ArtifactRevisionError("ARTIFACT_SOURCE_NOT_EDITABLE");
        }

        const maximum = await transaction.findSeriesMaxVersion({
          courseId: input.courseId,
          seriesId: source.seriesId
        });
        if (maximum === null) {
          throw new ArtifactRevisionError("ARTIFACT_SOURCE_NOT_FOUND");
        }

        const descriptor = nextArtifactRevision({ ...source, status }, maximum);
        return transaction.create({
          ...descriptor,
          userId: input.userId,
          title: input.title,
          payload: input.payload
        });
      });
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      if (attempt === maxAttempts) {
        throw new ArtifactRevisionError("ARTIFACT_REVISION_CONFLICT", true);
      }
    }
  }

  throw new ArtifactRevisionError("ARTIFACT_REVISION_CONFLICT", true);
}
