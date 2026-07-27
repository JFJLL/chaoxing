import { describe, expect, it, vi } from "vitest";
import {
  ArtifactRevisionError,
  updateArtifactInPlace,
  type MutableArtifactStore
} from "@/lib/courseWorkspace/artifactRevision";
import {
  confirmArtifactUpdate,
  deleteArtifact,
  withdrawArtifact,
  type ArtifactWorkflowStore,
  type ArtifactWorkflowTransaction
} from "@/lib/courseWorkspace/artifactWorkflow";

describe("mutable AI artifact saves", () => {
  it("updates the same history row and keeps a published artifact published", async () => {
    const updated = { id: "artifact-1", status: "PUBLISHED", lockVersion: 8 };
    const store: MutableArtifactStore<typeof updated> = {
      findByCourse: vi.fn().mockResolvedValue({
        id: "artifact-1",
        courseId: "course-1",
        status: "PUBLISHED",
        payload: "{\"old\":true}",
        lockVersion: 7,
        deletedAt: null
      }),
      updateWorkingCopy: vi.fn().mockResolvedValue(updated)
    };

    await expect(updateArtifactInPlace(store, {
      courseId: "course-1",
      artifactId: "artifact-1",
      expectedLockVersion: 7,
      title: "更新后的教案",
      payload: "{\"new\":true}"
    })).resolves.toBe(updated);

    expect(store.updateWorkingCopy).toHaveBeenCalledWith(expect.objectContaining({
      id: "artifact-1",
      expectedLockVersion: 7,
      nextStatus: "PUBLISHED"
    }));
  });

  it("turns a lost optimistic lock into a retryable conflict", async () => {
    const store: MutableArtifactStore<Record<string, never>> = {
      findByCourse: vi.fn().mockResolvedValue({
        id: "artifact-1",
        courseId: "course-1",
        status: "DRAFT",
        payload: "{}",
        lockVersion: 2,
        deletedAt: null
      }),
      updateWorkingCopy: vi.fn().mockResolvedValue(null)
    };

    await expect(updateArtifactInPlace(store, {
      courseId: "course-1",
      artifactId: "artifact-1",
      expectedLockVersion: 1,
      title: "冲突",
      payload: "{}"
    })).rejects.toEqual(expect.objectContaining({
      code: "ARTIFACT_REVISION_CONFLICT",
      retryable: true
    }));
    expect(new ArtifactRevisionError("ARTIFACT_REVISION_CONFLICT", true)).toBeInstanceOf(Error);
  });
});

function mutableWorkflow() {
  const artifact = {
    id: "artifact-1",
    courseId: "course-1",
    seriesId: "series-1",
    sourceArtifactId: null,
    appType: "lesson_plan",
    status: "PUBLISHED",
    payload: JSON.stringify({
      objectives: ["新目标"],
      keyPoints: ["新重点"],
      teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }],
      assessment: ["提问"]
    }),
    publishedPayload: JSON.stringify({
      objectives: ["旧目标"],
      keyPoints: ["旧重点"],
      teachingProcess: [{ phase: "导入", minutes: 10, activity: "讲授" }],
      assessment: ["测验"]
    }),
    lockVersion: 3,
    deletedAt: null
  };
  const calls = {
    confirmUpdate: vi.fn().mockResolvedValue(1),
    withdraw: vi.fn().mockResolvedValue(1),
    remove: vi.fn().mockResolvedValue(1)
  };
  const transaction: ArtifactWorkflowTransaction<Record<string, unknown>> = {
    findArtifact: vi.fn().mockResolvedValue(artifact),
    findApprovedQuestionIds: vi.fn().mockResolvedValue([]),
    findSourceCourseware: vi.fn().mockResolvedValue(null),
    approveArtifact: vi.fn().mockResolvedValue(1),
    upsertQuestion: vi.fn(),
    archiveQuestionsExcept: vi.fn(),
    archivePublishedInSeries: vi.fn(),
    publishArtifact: vi.fn().mockResolvedValue(1),
    confirmPublishedUpdate: calls.confirmUpdate,
    withdrawPublishedArtifact: calls.withdraw,
    softDeleteArtifact: calls.remove,
    findSafeArtifact: vi.fn().mockResolvedValue({ ...artifact, lockVersion: 4 })
  };
  const store: ArtifactWorkflowStore<Record<string, unknown>> = {
    transaction: (operation) => operation(transaction)
  };
  return { artifact, calls, store, transaction };
}

describe("published working copy lifecycle", () => {
  it("copies the working payload only when confirm-update is called", async () => {
    const current = mutableWorkflow();
    await confirmArtifactUpdate(current.store, {
      courseId: "course-1",
      artifactId: "artifact-1",
      userId: "teacher-1",
      expectedLockVersion: 3
    });
    expect(current.calls.confirmUpdate).toHaveBeenCalledWith(
      "artifact-1",
      "course-1",
      expect.any(Date),
      current.artifact.payload,
      3
    );
  });

  it("requires withdrawal before soft delete", async () => {
    const current = mutableWorkflow();
    await expect(deleteArtifact(current.store, {
      courseId: "course-1",
      artifactId: "artifact-1",
      expectedLockVersion: 3
    })).rejects.toMatchObject({ code: "ARTIFACT_DELETE_REQUIRES_WITHDRAWAL" });

    await withdrawArtifact(current.store, {
      courseId: "course-1",
      artifactId: "artifact-1",
      expectedLockVersion: 3
    });
    expect(current.calls.withdraw).toHaveBeenCalled();

    current.artifact.status = "APPROVED";
    await expect(deleteArtifact(current.store, {
      courseId: "course-1",
      artifactId: "artifact-1",
      expectedLockVersion: 4
    })).resolves.toEqual({ id: "artifact-1", deleted: true });
    expect(current.calls.remove).toHaveBeenCalledWith(
      "artifact-1",
      "course-1",
      expect.any(Date),
      4
    );
  });
});
