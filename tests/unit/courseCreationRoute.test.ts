import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    course: {
      create: vi.fn(),
      update: vi.fn()
    },
    driveFile: {
      create: vi.fn()
    }
  };
  return {
    tx,
    requireUser: vi.fn(),
    assertTeacher: vi.fn(),
    transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
      operation(tx)
    )
  };
});

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/permissions", () => ({
  assertTeacher: mocks.assertTeacher,
  isTeacher: vi.fn(() => true)
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    course: { findMany: vi.fn() },
    courseEnrollment: { findMany: vi.fn() }
  }
}));

import { POST } from "@/app/api/courses/route";

describe("POST /api/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "teacher-1",
      name: "教师",
      role: "TEACHER",
      institutionId: "institution-1"
    });
    mocks.tx.course.create.mockResolvedValue({
      id: "course-1",
      title: "文化产业管理"
    });
    mocks.tx.driveFile.create.mockResolvedValue({
      id: "course-drive-root-course-1",
      name: "文化产业管理"
    });
    mocks.tx.course.update.mockResolvedValue({
      id: "course-1",
      title: "文化产业管理",
      driveRootFolderId: "course-drive-root-course-1"
    });
  });

  it("creates the course and its private drive root in one transaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: " 文化产业管理 ",
          coverStyle: "ai"
        })
      }) as never
    );

    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.course.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "文化产业管理",
        ownerId: "teacher-1",
        institutionId: "institution-1"
      })
    });
    expect(mocks.tx.driveFile.create).toHaveBeenCalledWith({
      data: {
        id: "course-drive-root-course-1",
        ownerId: "teacher-1",
        parentId: null,
        name: "文化产业管理",
        kind: "folder"
      }
    });
    expect(mocks.tx.course.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { driveRootFolderId: "course-drive-root-course-1" }
    });
    await expect(response.json()).resolves.toMatchObject({
      course: { id: "course-1", driveRootFolderId: "course-drive-root-course-1" }
    });
  });
});
