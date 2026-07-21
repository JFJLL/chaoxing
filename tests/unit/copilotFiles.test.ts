import { describe, expect, it } from "vitest";
import {
  copilotExtractionCanBeSelected,
  copilotExtractionErrorMessage,
  copilotExtractionNeedsIndexing
} from "@/lib/copilot/files";

describe("Copilot course-file extraction state", () => {
  it("allows a failed document to be selected and retried", () => {
    expect(copilotExtractionCanBeSelected("FAILED")).toBe(true);
    expect(copilotExtractionNeedsIndexing("FAILED")).toBe(true);
    expect(copilotExtractionNeedsIndexing("READY")).toBe(false);
  });

  it("keeps unsupported and oversized documents unavailable", () => {
    expect(copilotExtractionCanBeSelected("UNSUPPORTED")).toBe(false);
    expect(copilotExtractionCanBeSelected("TOO_LARGE")).toBe(false);
  });

  it("turns the OSS signature XML into an actionable retry message", () => {
    const message = copilotExtractionErrorMessage(new Error("阿里云 OSS 下载失败：403 <Code>SignatureDoesNotMatch</Code>"));

    expect(message).toContain("重新选择文件重试");
    expect(message).not.toContain("<Code>");
  });
});
