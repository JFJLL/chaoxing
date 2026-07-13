import { describe, expect, it } from "vitest";
import {
  IMPORT_STEPS,
  getImportStepStates,
  getJobsAhead,
  getNextPollDelay,
  parseImportJobResponse,
  getQueueLabel,
  getUploadButtonLabel,
  isImportTerminal
} from "@/lib/imports/importProgress";

describe("import progress", () => {
  it("keeps the import steps in the required key and label order", () => {
    expect(IMPORT_STEPS).toEqual([
      { key: "QUEUED", label: "文档上传" },
      { key: "EXTRACTING", label: "内容解析" },
      { key: "STRUCTURING", label: "目录生成" },
      { key: "MAPPING", label: "知识导图" },
      { key: "READY_FOR_REVIEW", label: "等待确认" },
      { key: "APPLIED", label: "已应用" }
    ]);
  });

  it("marks only earlier stages complete and maps generating to structuring", () => {
    expect(getImportStepStates("STRUCTURING").map((step) => step.state)).toEqual([
      "complete", "complete", "active", "pending", "pending", "pending"
    ]);
    expect(getImportStepStates("GENERATING").map((step) => step.state)).toEqual([
      "complete", "complete", "active", "pending", "pending", "pending"
    ]);
  });

  it("recognizes terminal statuses and leaves failed steps pending", () => {
    expect(isImportTerminal("READY_FOR_REVIEW")).toBe(true);
    expect(isImportTerminal("APPLIED")).toBe(true);
    expect(isImportTerminal("FAILED")).toBe(true);
    expect(isImportTerminal("MAPPING")).toBe(false);
    expect(getImportStepStates("FAILED").map((step) => step.state)).toEqual([
      "pending", "pending", "pending", "pending", "pending", "pending"
    ]);
  });

  it("describes the number of jobs ahead", () => {
    expect(getQueueLabel(0)).toBe("即将开始处理");
    expect(getQueueLabel(1)).toBe("前方还有 1 个任务");
    expect(getQueueLabel(null)).toBe("等待系统处理");
  });

  it("counts active workers and earlier queued jobs", () => {
    expect(getJobsAhead(2, 0)).toBe(2);
    expect(getJobsAhead(2, 3)).toBe(5);
    expect(getJobsAhead(0, -1)).toBeNull();
  });

  it("polls active imports and stops at terminal statuses", () => {
    expect(getNextPollDelay("QUEUED")).toBe(1500);
    expect(getNextPollDelay("MAPPING")).toBe(1500);
    expect(getNextPollDelay("READY_FOR_REVIEW")).toBeNull();
    expect(getNextPollDelay("FAILED")).toBeNull();
  });

  it("shows whether an upload is being submitted", () => {
    expect(getUploadButtonLabel(false)).toBe("提交解析任务");
    expect(getUploadButtonLabel(true)).toBe("正在上传文档");
  });

  it("accepts a well-formed polling response", () => {
    expect(
      parseImportJobResponse({
        job: {
          status: "STRUCTURING",
          currentStage: "课程结构生成",
          jobsAhead: 0,
          errorMessage: null
        }
      })
    ).toEqual({
      status: "STRUCTURING",
      currentStage: "课程结构生成",
      jobsAhead: 0,
      errorMessage: null
    });
  });

  it.each([
    null,
    {},
    { job: null },
    { job: { status: "UNKNOWN", currentStage: null, jobsAhead: null, errorMessage: null } },
    { job: { status: "QUEUED", currentStage: 1, jobsAhead: null, errorMessage: null } },
    { job: { status: "QUEUED", currentStage: null, jobsAhead: -1, errorMessage: null } },
    { job: { status: "QUEUED", currentStage: null, jobsAhead: 1.5, errorMessage: null } },
    { job: { status: "QUEUED", currentStage: null, jobsAhead: null, errorMessage: {} } }
  ])("rejects malformed polling response %#", (response) => {
    expect(parseImportJobResponse(response)).toBeNull();
  });
});
