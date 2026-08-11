import { describe, expect, it } from "vitest";
import { noticeEngagementCompletionRate } from "@/lib/teaching/lessonCompletion";

describe("notice engagement completion", () => {
  it("returns no rate when the course has no notices", () => {
    expect(noticeEngagementCompletionRate([], [], [], "student-1")).toBeNull();
  });

  it("does not count a read notice as complete until required attachments are downloaded", () => {
    expect(noticeEngagementCompletionRate([
      { id: "notice-1", attachments: [{ driveFileId: "file-1", deleted: false }] }
    ], [{ announcementId: "notice-1", userId: "student-1" }], [], "student-1")).toBe(0);
  });

  it("counts a notice as complete after it is read and all attachments are downloaded", () => {
    expect(noticeEngagementCompletionRate([
      { id: "notice-1", attachments: [{ driveFileId: "file-1", deleted: false }, { driveFileId: "file-2", deleted: false }] }
    ], [{ announcementId: "notice-1", userId: "student-1" }], [{ driveFileId: "file-1", userId: "student-1" }, { driveFileId: "file-2", userId: "student-1" }], "student-1")).toBe(100);
  });

  it("treats deleted attachments as already satisfied", () => {
    expect(noticeEngagementCompletionRate([
      { id: "notice-1", attachments: [{ driveFileId: "file-1", deleted: true }] }
    ], [{ announcementId: "notice-1", userId: "student-1" }], [], "student-1")).toBe(100);
  });

  it("reuses one download record for the same file wherever it is referenced", () => {
    expect(noticeEngagementCompletionRate([
      { id: "notice-1", attachments: [{ driveFileId: "file-1", deleted: false }] },
      { id: "notice-2", attachments: [{ driveFileId: "file-1", deleted: false }] }
    ], [{ announcementId: "notice-1", userId: "student-1" }, { announcementId: "notice-2", userId: "student-1" }], [{ driveFileId: "file-1", userId: "student-1" }], "student-1")).toBe(100);
  });

  it("keeps different students isolated from each other's reads and downloads", () => {
    expect(noticeEngagementCompletionRate([
      { id: "notice-1", attachments: [{ driveFileId: "file-1", deleted: false }] },
      { id: "notice-2", attachments: [] }
    ], [{ announcementId: "notice-1", userId: "student-1" }, { announcementId: "notice-2", userId: "student-2" }], [{ driveFileId: "file-1", userId: "student-2" }], "student-1")).toBe(0);
  });
});
