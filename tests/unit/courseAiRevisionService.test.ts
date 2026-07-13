import { describe, expect, it } from "vitest";
import {
  ArtifactRevisionError,
  createArtifactRevision,
  type ArtifactRevisionSourceRecord,
  type ArtifactRevisionStore,
  type ArtifactRevisionTransaction
} from "@/lib/courseWorkspace/artifactRevision";

const source: ArtifactRevisionSourceRecord = {
  id: "artifact-v1",
  seriesId: "series-1",
  courseId: "course-1",
  userId: "original-teacher",
  appType: "lesson_plan",
  title: "历史教案",
  prompt: "原始要求",
  payload: "{\"old\":true}",
  inputSnapshot: "{\"context\":true}",
  scope: "{\"chapterIds\":[\"chapter-1\"]}",
  sourceJobId: "job-1",
  status: "ARCHIVED",
  version: 1
};

function fakeStore(options?: {
  source?: ArtifactRevisionSourceRecord | null;
  maximums?: number[];
  createErrors?: unknown[];
}) {
  const created: Array<Record<string, unknown>> = [];
  let transactionIndex = 0;
  const maximums = options?.maximums ?? [3];
  const createErrors = options?.createErrors ?? [];

  const store: ArtifactRevisionStore<Record<string, unknown>> = {
    async transaction(operation) {
      const attempt = transactionIndex++;
      const transaction: ArtifactRevisionTransaction<Record<string, unknown>> = {
        async findSourceByCourse() {
          return options && "source" in options ? options.source ?? null : source;
        },
        async findSeriesMaxVersion() {
          return maximums[Math.min(attempt, maximums.length - 1)];
        },
        async create(data) {
          const error = createErrors[attempt];
          if (error) throw error;
          created.push(data);
          return data;
        }
      };
      return operation(transaction);
    }
  };

  return { store, created, transactionCount: () => transactionIndex };
}

describe("createArtifactRevision", () => {
  it("creates max + 1 from an old revision in the same server-owned series", async () => {
    const { store, created } = fakeStore({ maximums: [3] });

    const result = await createArtifactRevision(store, {
      courseId: "course-1",
      sourceArtifactId: "artifact-v1",
      userId: "editing-teacher",
      title: "修改后的教案",
      payload: "{\"edited\":true}"
    });

    expect(result).toEqual(created[0]);
    expect(created[0]).toMatchObject({
      courseId: "course-1",
      userId: "editing-teacher",
      sourceArtifactId: "artifact-v1",
      seriesId: "series-1",
      version: 4,
      status: "DRAFT",
      title: "修改后的教案",
      payload: "{\"edited\":true}"
    });
  });

  it("retries a version uniqueness conflict after rereading the series maximum", async () => {
    const { store, created, transactionCount } = fakeStore({
      maximums: [3, 4],
      createErrors: [{ code: "P2002" }]
    });

    await createArtifactRevision(store, {
      courseId: "course-1",
      sourceArtifactId: "artifact-v1",
      userId: "teacher-1",
      title: "并发修改",
      payload: "{}"
    });

    expect(transactionCount()).toBe(2);
    expect(created[0]).toMatchObject({ seriesId: "series-1", version: 5 });
  });

  it("returns a stable retryable error after bounded uniqueness conflicts", async () => {
    const { store, transactionCount } = fakeStore({
      maximums: [3, 4, 5],
      createErrors: [{ code: "P2002" }, { code: "P2002" }, { code: "P2002" }]
    });

    await expect(
      createArtifactRevision(store, {
        courseId: "course-1",
        sourceArtifactId: "artifact-v1",
        userId: "teacher-1",
        title: "并发修改",
        payload: "{}"
      })
    ).rejects.toMatchObject({ code: "ARTIFACT_REVISION_CONFLICT", retryable: true });
    expect(transactionCount()).toBe(3);
  });

  it("rejects cross-course source IDs, empty payloads, and illegal source states", async () => {
    const missing = fakeStore({ source: null });
    await expect(
      createArtifactRevision(missing.store, {
        courseId: "other-course",
        sourceArtifactId: "artifact-v1",
        userId: "teacher-1",
        title: "跨课程",
        payload: "{}"
      })
    ).rejects.toMatchObject({ code: "ARTIFACT_SOURCE_NOT_FOUND" });

    const normal = fakeStore();
    await expect(
      createArtifactRevision(normal.store, {
        courseId: "course-1",
        sourceArtifactId: "artifact-v1",
        userId: "teacher-1",
        title: "空内容",
        payload: "   "
      })
    ).rejects.toMatchObject({ code: "ARTIFACT_PAYLOAD_REQUIRED" });

    const active = fakeStore({ source: { ...source, status: "GENERATING" } });
    await expect(
      createArtifactRevision(active.store, {
        courseId: "course-1",
        sourceArtifactId: "artifact-v1",
        userId: "teacher-1",
        title: "非法状态",
        payload: "{}"
      })
    ).rejects.toMatchObject({ code: "ARTIFACT_SOURCE_NOT_EDITABLE" });
  });

  it("ignores client-supplied seriesId and version fields", async () => {
    const { store, created } = fakeStore({ maximums: [8] });
    const untrustedInput = {
      courseId: "course-1",
      sourceArtifactId: "artifact-v1",
      userId: "teacher-1",
      title: "客户端伪造版本",
      payload: "{}",
      seriesId: "attacker-series",
      version: 999
    };

    await createArtifactRevision(store, untrustedInput);

    expect(created[0]).toMatchObject({ seriesId: "series-1", version: 9 });
  });

  it("does not convert unrelated persistence errors into conflict errors", async () => {
    const { store } = fakeStore({ createErrors: [new Error("database unavailable")] });

    await expect(
      createArtifactRevision(store, {
        courseId: "course-1",
        sourceArtifactId: "artifact-v1",
        userId: "teacher-1",
        title: "保存失败",
        payload: "{}"
      })
    ).rejects.toThrow("database unavailable");
    await expect(Promise.resolve(new ArtifactRevisionError("ARTIFACT_REVISION_CONFLICT", true))).resolves.toBeInstanceOf(
      ArtifactRevisionError
    );
  });
});
