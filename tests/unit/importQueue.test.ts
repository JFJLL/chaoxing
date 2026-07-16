import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runImportJob: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  aggregate: vi.fn(),
  count: vi.fn()
}));

vi.mock("@/lib/imports/runImportJob", () => ({ runImportJob: mocks.runImportJob }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportJob: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      aggregate: mocks.aggregate,
      count: mocks.count
    }
  }
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadQueue() {
  vi.resetModules();
  return import("@/lib/imports/importQueue");
}

describe("in-process import queue", () => {
  beforeEach(() => {
    mocks.runImportJob.mockReset();
    mocks.findMany.mockReset();
    mocks.updateMany.mockReset();
    mocks.aggregate.mockReset();
    mocks.count.mockReset();
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
    mocks.count.mockResolvedValue(0);
    process.env.MAX_IMPORT_WORKERS = "1";
    process.env.MAX_COURSE_UPLOAD_MB = "1";
    process.env.MAX_INSTITUTION_UPLOAD_MB = "10";
  });

  it("keeps a running job reserved when polling recovery sees it as queued", async () => {
    const running = deferred();
    mocks.runImportJob.mockReturnValueOnce(running.promise);
    mocks.findMany.mockResolvedValueOnce([{ id: "job-1", status: "QUEUED" }]);
    const queue = await loadQueue();

    queue.enqueueImportJob("job-1");
    await vi.waitFor(() => expect(mocks.runImportJob).toHaveBeenCalledTimes(1));
    await queue.recoverImportJobsFromDatabase("course-1");

    expect(queue.getImportQueueSnapshot()).toMatchObject({ activeWorkers: 1, pendingJobs: [] });
    running.resolve();
    await vi.waitFor(() => expect(queue.getImportQueueSnapshot().activeWorkers).toBe(0));
    expect(mocks.runImportJob).toHaveBeenCalledTimes(1);
  });

  it("does not reset or enqueue a stale database record while the same job is running locally", async () => {
    const running = deferred();
    mocks.runImportJob.mockReturnValueOnce(running.promise);
    mocks.findMany.mockResolvedValueOnce([{ id: "job-1", status: "STRUCTURING" }]);
    const queue = await loadQueue();

    queue.enqueueImportJob("job-1");
    await vi.waitFor(() => expect(mocks.runImportJob).toHaveBeenCalledTimes(1));
    await queue.recoverImportJobsFromDatabase();

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(queue.getImportQueueSnapshot().pendingJobs).toEqual([]);
    running.resolve();
    await vi.waitFor(() => expect(queue.getImportQueueSnapshot().activeWorkers).toBe(0));
  });

  it("recovers a genuinely stale job when it is not owned by this process", async () => {
    mocks.runImportJob.mockResolvedValueOnce(undefined);
    mocks.findMany.mockResolvedValueOnce([{ id: "job-stale", status: "EXTRACTING" }]);
    const queue = await loadQueue();

    await queue.recoverImportJobsFromDatabase();

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["job-stale"] } } })
    );
    await vi.waitFor(() => expect(mocks.runImportJob).toHaveBeenCalledWith("job-stale"));
  });

  it("releases the reservation only after the job promise settles", async () => {
    const first = deferred();
    mocks.runImportJob.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const queue = await loadQueue();

    queue.enqueueImportJob("job-1");
    queue.enqueueImportJob("job-1");
    await vi.waitFor(() => expect(mocks.runImportJob).toHaveBeenCalledTimes(1));

    first.resolve();
    await vi.waitFor(() => expect(queue.getImportQueueSnapshot().activeWorkers).toBe(0));
    queue.enqueueImportJob("job-1");
    await vi.waitFor(() => expect(mocks.runImportJob).toHaveBeenCalledTimes(2));
  });

  it("reserves course bytes so concurrent admissions cannot both pass the same quota", async () => {
    mocks.aggregate.mockImplementation(async (query) => (
      "courseId" in query.where
        ? { _sum: { fileSize: 900_000 } }
        : { _sum: { fileSize: 0 } }
    ));
    const queue = await loadQueue();
    const first = await queue.reserveImportJobAdmission({
      institutionId: "institution-1",
      courseId: "course-1",
      userId: "user-1",
      fileSize: 100_000
    });

    await expect(queue.reserveImportJobAdmission({
      institutionId: "institution-1",
      courseId: "course-1",
      userId: "user-2",
      fileSize: 100_000
    })).rejects.toMatchObject({ code: "AI_IMPORT_COURSE_QUOTA_EXCEEDED", status: 400 });

    first.release();
    await expect(queue.reserveImportJobAdmission({
      institutionId: "institution-1",
      courseId: "course-1",
      userId: "user-2",
      fileSize: 100_000
    })).resolves.toMatchObject({ release: expect.any(Function) });
  });

  it.each([
    [99, 0, 0, "AI_IMPORT_GLOBAL_BACKLOG_FULL", 503],
    [0, 19, 0, "AI_IMPORT_COURSE_BACKLOG_FULL", 429],
    [0, 0, 29, "AI_IMPORT_USER_BACKLOG_FULL", 429]
  ])("atomically rejects concurrent backlog overflow", async (globalCount, courseCount, userCount, code, status) => {
    mocks.count.mockImplementation(async (query) => {
      if (query.where.userId) return userCount;
      if (query.where.courseId) return courseCount;
      return globalCount;
    });
    const queue = await loadQueue();
    const first = await queue.reserveImportJobAdmission({
      institutionId: "institution-1",
      courseId: "course-1",
      userId: "user-1",
      fileSize: 1
    });

    await expect(queue.reserveImportJobAdmission({
      institutionId: "institution-1",
      courseId: "course-1",
      userId: "user-1",
      fileSize: 1
    })).rejects.toMatchObject({ code, status });
    first.release();
  });

  it("recovers jobs in cursor batches without loading the whole backlog", async () => {
    const firstBatch = Array.from({ length: 25 }, (_, index) => ({ id: `job-${String(index).padStart(2, "0")}`, status: "QUEUED" }));
    mocks.findMany.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([{ id: "job-25", status: "QUEUED" }]);
    const running = deferred();
    mocks.runImportJob.mockReturnValue(running.promise);
    const queue = await loadQueue();

    await queue.recoverImportJobsFromDatabase();

    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 25, orderBy: { id: "asc" } }));
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      take: 25,
      cursor: { id: "job-24" },
      skip: 1
    }));
    expect(queue.getImportQueueSnapshot().activeWorkers + queue.getImportQueueSnapshot().pendingJobs.length).toBe(26);
    running.resolve();
    await vi.waitFor(() => expect(queue.getImportQueueSnapshot().activeWorkers).toBe(0));
  });

  it("caps recovered in-memory work at one hundred jobs", async () => {
    const batches = Array.from({ length: 4 }, (_, batch) => Array.from({ length: 25 }, (_, index) => ({
      id: `job-${batch}-${index}`,
      status: "QUEUED"
    })));
    batches.forEach((batch) => mocks.findMany.mockResolvedValueOnce(batch));
    const running = deferred();
    mocks.runImportJob.mockReturnValue(running.promise);
    const queue = await loadQueue();

    await queue.recoverImportJobsFromDatabase();

    const snapshot = queue.getImportQueueSnapshot();
    expect(snapshot.activeWorkers + snapshot.pendingJobs.length).toBe(100);
    expect(mocks.findMany).toHaveBeenCalledTimes(4);
    running.resolve();
    await vi.waitFor(() => expect(queue.getImportQueueSnapshot().activeWorkers).toBe(0));
  });

  it("limits import starts to five per user and course in ten minutes", async () => {
    const queue = await loadQueue();
    for (let index = 0; index < 5; index += 1) {
      const lease = queue.acquireImportRequest("user-1", "course-1");
      expect(lease.allowed).toBe(true);
      if (lease.allowed) lease.release();
    }

    expect(queue.acquireImportRequest("user-1", "course-1")).toMatchObject({ allowed: false, reason: "rate" });
    expect(queue.acquireImportRequest("user-1", "course-2").allowed).toBe(true);
  });

  it("counts every real non-terminal import status and no synthetic status for backlog admission", async () => {
    const queue = await loadQueue();
    const reservation = await queue.reserveImportJobAdmission({
      institutionId: "institution-1",
      courseId: "course-1",
      userId: "user-1",
      fileSize: 1
    });

    const expectedStatuses = ["QUEUED", "EXTRACTING", "STRUCTURING", "MAPPING"];
    expect(mocks.count).toHaveBeenCalledTimes(3);
    for (const [query] of mocks.count.mock.calls) {
      expect(query.where.status.in).toEqual(expectedStatuses);
      expect(query.where.status.in).not.toContain("GENERATING");
    }
    reservation.release();
  });
});
