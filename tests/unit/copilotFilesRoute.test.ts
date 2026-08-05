import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  readBounded: vi.fn(),
  listCourseCopilotFiles: vi.fn(),
  storeCourseConversationUpload: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/imports/importUpload", () => ({
  readBoundedMultipartFormData: mocks.readBounded,
  ImportRequestBodyError: class ImportRequestBodyError {
    constructor(public readonly reason: "too_large" | "invalid") {}
  }
}));

vi.mock("@/lib/copilot/files", () => ({
  COPILOT_MAX_UPLOAD_BYTES: 255 * 1024 * 1024,
  listCourseCopilotFiles: mocks.listCourseCopilotFiles,
  storeCourseConversationUpload: mocks.storeCourseConversationUpload
}));

import { ImportRequestBodyError } from "@/lib/imports/importUpload";
import { POST } from "@/app/api/courses/[courseId]/copilot/files/route";

const context = { params: Promise.resolve({ courseId: "course-1" }) };

describe("copilot conversation file upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  });

  it("rejects an oversized multipart body with a 255MB message", async () => {
    mocks.readBounded.mockRejectedValue(new ImportRequestBodyError("too_large"));

    const response = await POST(new Request("http://localhost/api/courses/course-1/copilot/files", {
      method: "POST",
      body: new FormData()
    }), context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "文件不能超过 255MB" });
  });

  it("uploads an accepted file into the conversation folder", async () => {
    const form = new FormData();
    form.set("file", new File(["abc"], "courseware.pdf", { type: "application/pdf" }));
    mocks.readBounded.mockResolvedValue(form);
    mocks.storeCourseConversationUpload.mockResolvedValue({ id: "drive-1", name: "courseware.pdf" });

    const response = await POST(new Request("http://localhost/api/courses/course-1/copilot/files", {
      method: "POST",
      body: form
    }), context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ file: { id: "drive-1", name: "courseware.pdf" } });
    expect(mocks.storeCourseConversationUpload).toHaveBeenCalledWith(
      { id: "teacher-1", role: "TEACHER" },
      "course-1",
      expect.any(File)
    );
  });
});
