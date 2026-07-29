import { describe, expect, it, vi } from "vitest";
import {
  ImportRequestBodyError,
  createSubmissionLock,
  readBoundedMultipartFormData,
  uploadCourseDocument
} from "@/lib/imports/importUpload";

function createFile() {
  return new File(["course content"], "course.pdf", { type: "application/pdf" });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("import upload", () => {
  it("counts actual multipart chunks instead of trusting Content-Length", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=test",
        "Content-Length": "1"
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(40));
          controller.enqueue(new Uint8Array(40));
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedMultipartFormData(request, 64)).rejects.toMatchObject({
      name: "ImportRequestBodyError",
      reason: "too_large"
    } satisfies Partial<ImportRequestBodyError>);
  });

  it("rebuilds a bounded multipart request before parsing form data", async () => {
    const input = new FormData();
    input.set("file", createFile());
    const request = new Request("http://localhost/upload", { method: "POST", body: input });

    const parsed = await readBoundedMultipartFormData(request, 1_024);

    expect(parsed.get("file")).toBeInstanceOf(File);
    expect((parsed.get("file") as File).name).toBe("course.pdf");
  });

  it("allows only the first synchronous submission", () => {
    const lock = createSubmissionLock();

    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
  });

  it("allows another submission after release", () => {
    const lock = createSubmissionLock();

    expect(lock.acquire()).toBe(true);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });

  it("posts the document and returns the job id", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ jobId: "job-123" }, 201)
    );
    const file = createFile();

    await expect(uploadCourseDocument({ courseId: "course-7", file, request })).resolves.toBe("job-123");
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("/api/courses/course-7/ai-import");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).getAll("files")).toEqual([file]);
  });

  it("normalizes network errors", async () => {
    const request = vi.fn(async () => {
      throw new TypeError("offline");
    });

    await expect(uploadCourseDocument({ courseId: "course-7", file: createFile(), request }))
      .rejects.toThrow("上传失败，请重试");
  });

  it("preserves backend errors for non-2xx responses", async () => {
    const request = vi.fn(async () => jsonResponse({ error: "文件格式不支持" }, 400));

    await expect(uploadCourseDocument({ courseId: "course-7", file: createFile(), request }))
      .rejects.toThrow("文件格式不支持");
  });

  it("normalizes invalid JSON responses", async () => {
    const request = vi.fn(async () => new Response("not json", { status: 200 }));

    await expect(uploadCourseDocument({ courseId: "course-7", file: createFile(), request }))
      .rejects.toThrow("上传失败，请重试");
  });

  it("rejects successful responses without a job id", async () => {
    const request = vi.fn(async () => jsonResponse({}));

    await expect(uploadCourseDocument({ courseId: "course-7", file: createFile(), request }))
      .rejects.toThrow("上传失败，请重试");
  });
});
