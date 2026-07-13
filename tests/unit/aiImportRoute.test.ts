import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  aggregate: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  storeImportFile: vi.fn(),
  runImportJob: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportJob: {
      aggregate: mocks.aggregate,
      count: mocks.count,
      create: mocks.create,
      update: mocks.update,
      findMany: mocks.findMany,
      updateMany: mocks.updateMany
    }
  }
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/storage")>(),
  storeImportFile: mocks.storeImportFile
}));
vi.mock("@/lib/imports/runImportJob", () => ({ runImportJob: mocks.runImportJob }));

import { POST } from "../../src/app/api/courses/[courseId]/ai-import/route";
import { resetImportAdmissionState, resetImportRequestGuard } from "../../src/lib/imports/importQueue";

const context = { params: Promise.resolve({ courseId: "course-1" }) };

function uploadRequest() {
  const formData = new FormData();
  formData.set("file", new File(["course content"], "course.pdf", { type: "application/pdf" }));
  return new Request("http://localhost/api/courses/course-1/ai-import", { method: "POST", body: formData });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("POST /api/courses/:courseId/ai-import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetImportRequestGuard();
    resetImportAdmissionState();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.requireCourseOwner.mockResolvedValue({ id: "course-1", institutionId: "institution-1" });
    mocks.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "job-1" });
    mocks.update.mockResolvedValue({ id: "job-1" });
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.storeImportFile.mockResolvedValue(".uploads/job-1.pdf");
    mocks.runImportJob.mockResolvedValue(undefined);
  });

  it("rejects a chunked multipart body above 52MB despite a fake Content-Length", async () => {
    let chunks = 0;
    const request = new Request("http://localhost/api/courses/course-1/ai-import", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=test",
        "Content-Length": "1"
      },
      body: new ReadableStream({
        pull(controller) {
          if (chunks < 53) {
            controller.enqueue(new Uint8Array(1024 * 1024));
            chunks += 1;
          } else {
            controller.close();
          }
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    const response = await POST(request as never, context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_IMPORT_BODY_TOO_LARGE", retryable: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows one active upload per user and course and releases the guard in finally", async () => {
    const stored = deferred<string>();
    mocks.storeImportFile.mockReturnValueOnce(stored.promise);
    const first = POST(uploadRequest() as never, context);
    await vi.waitFor(() => expect(mocks.storeImportFile).toHaveBeenCalledOnce());

    const concurrent = await POST(uploadRequest() as never, context);
    expect(concurrent.status).toBe(429);
    await expect(concurrent.json()).resolves.toMatchObject({ code: "AI_IMPORT_RATE_LIMITED", retryable: true });

    stored.resolve(".uploads/job-1.pdf");
    await expect(first).resolves.toMatchObject({ status: 202 });
  });

  it("returns service unavailable without creating a job when global active backlog is full", async () => {
    mocks.count.mockImplementation(async (query) => "courseId" in query.where ? 0 : 100);

    const response = await POST(uploadRequest() as never, context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_IMPORT_GLOBAL_BACKLOG_FULL", retryable: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.storeImportFile).not.toHaveBeenCalled();
  });
});
