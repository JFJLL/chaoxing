import { describe, expect, it } from "vitest";
import {
  copilotExtractionCanBeSelected,
  copilotExtractionErrorMessage,
  copilotExtractionNeedsIndexing,
  expandConversationReferenceIds
} from "@/lib/copilot/files";
import { copilotConversationUpdateSchema } from "@/lib/courseWorkspace/copilot";

describe("Copilot course-file extraction state", () => {
  it("allows a failed document to be selected and retried", () => {
    expect(copilotExtractionCanBeSelected("FAILED")).toBe(true);
    expect(copilotExtractionNeedsIndexing("FAILED")).toBe(true);
    expect(copilotExtractionNeedsIndexing("READY")).toBe(false);
  });

  it("keeps unsupported files unavailable and lets legacy oversized documents be retried", () => {
    expect(copilotExtractionCanBeSelected("UNSUPPORTED")).toBe(false);
    expect(copilotExtractionCanBeSelected("TOO_LARGE")).toBe(true);
    expect(copilotExtractionNeedsIndexing("TOO_LARGE")).toBe(true);
  });

  it("turns the OSS signature XML into an actionable retry message", () => {
    const message = copilotExtractionErrorMessage(new Error("阿里云 OSS 下载失败：403 <Code>SignatureDoesNotMatch</Code>"));

    expect(message).toContain("重新选择文件重试");
    expect(message).not.toContain("<Code>");
  });

  it("expands folder references dynamically from the currently accessible tree", () => {
    const references = [{ driveFileId: "folder-1", referenceType: "FOLDER" as const }];
    const initial = [
      { id: "folder-1", parentId: "root", kind: "folder" },
      { id: "file-1", parentId: "folder-1", kind: "file" }
    ];
    const afterUpload = [...initial, { id: "file-2", parentId: "folder-1", kind: "file" }];
    const afterFileDenied = afterUpload.filter((item) => item.id !== "file-1");

    expect(expandConversationReferenceIds(initial, references)).toEqual(["file-1"]);
    expect(expandConversationReferenceIds(afterUpload, references)).toEqual(["file-1", "file-2"]);
    expect(expandConversationReferenceIds(afterFileDenied, references)).toEqual(["file-2"]);
  });

  it("accepts more than five persistent references without a count cap", () => {
    const references = Array.from({ length: 12 }, (_, index) => ({
      driveFileId: `file-${index}`,
      referenceType: "FILE" as const
    }));

    expect(copilotConversationUpdateSchema.safeParse({ references }).success).toBe(true);
  });
});
