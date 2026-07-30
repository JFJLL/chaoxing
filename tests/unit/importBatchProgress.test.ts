import { describe, expect, it } from "vitest";
import {
  getImportBatchActionLabel,
  getImportBatchProgress
} from "../../src/lib/imports/importBatchProgress";

describe("import batch progress aggregation", () => {
  it.each([
    ["PROCESSING", "正在解析所选资料", "processing"],
    ["QUEUED", "正在解析所选资料", "processing"],
    ["COMBINING", "正在综合多份资料并生成课程目录", "processing"],
    ["READY_FOR_REVIEW", "待确认", "review"],
    ["APPLIED", "已保存课程目录", "applied"],
    ["FAILED", "导入失败", "failed"]
  ] as const)("maps batch status %s to a whole-batch label", (status, label, state) => {
    expect(getImportBatchProgress(status)).toEqual({ label, state });
  });

  it("never falls back to an unstarted label for an in-flight batch", () => {
    expect(getImportBatchProgress("PROCESSING").state).toBe("processing");
    expect(getImportBatchProgress("COMBINING").state).toBe("processing");
  });

  it.each([
    ["processing", "查看进度"],
    ["review", "查看并确认"],
    ["applied", "查看课程目录"],
    ["failed", "查看失败详情"]
  ] as const)("labels the %s action button", (state, label) => {
    expect(getImportBatchActionLabel(state)).toBe(label);
  });
});
