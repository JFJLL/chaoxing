import { describe, expect, it } from "vitest";
import {
  ARTIFACT_STATUSES,
  assertArtifactTransition,
  canArtifactTransition,
  getArtifactPollDelay,
  isArtifactTerminal,
  nextArtifactRevision,
  parseArtifactStatus
} from "@/lib/courseWorkspace/artifactState";

describe("course AI artifact state", () => {
  it("parses only supported artifact statuses", () => {
    expect(ARTIFACT_STATUSES).toEqual([
      "QUEUED",
      "GENERATING",
      "DRAFT",
      "FAILED",
      "APPROVED",
      "PUBLISHED",
      "ARCHIVED"
    ]);
    expect(parseArtifactStatus("DRAFT")).toBe("DRAFT");
    expect(parseArtifactStatus("draft")).toBeNull();
    expect(parseArtifactStatus("UNKNOWN")).toBeNull();
    expect(parseArtifactStatus(null)).toBeNull();
  });

  it.each([
    ["QUEUED", "GENERATING"],
    ["GENERATING", "DRAFT"],
    ["GENERATING", "FAILED"],
    ["FAILED", "QUEUED"],
    ["DRAFT", "APPROVED"],
    ["DRAFT", "ARCHIVED"],
    ["APPROVED", "PUBLISHED"],
    ["APPROVED", "ARCHIVED"],
    ["PUBLISHED", "ARCHIVED"]
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canArtifactTransition(from, to)).toBe(true);
    expect(() => assertArtifactTransition(from, to)).not.toThrow();
  });

  it.each([
    ["QUEUED", "DRAFT"],
    ["QUEUED", "FAILED"],
    ["GENERATING", "PUBLISHED"],
    ["FAILED", "DRAFT"],
    ["DRAFT", "PUBLISHED"],
    ["APPROVED", "DRAFT"],
    ["PUBLISHED", "APPROVED"],
    ["ARCHIVED", "DRAFT"],
    ["DRAFT", "DRAFT"]
  ] as const)("rejects illegal %s -> %s jumps", (from, to) => {
    expect(canArtifactTransition(from, to)).toBe(false);
    expect(() => assertArtifactTransition(from, to)).toThrow(`Illegal artifact transition: ${from} -> ${to}`);
  });

  it("stops polling after generation reaches a user-action or failure state", () => {
    expect(isArtifactTerminal("QUEUED")).toBe(false);
    expect(isArtifactTerminal("GENERATING")).toBe(false);
    expect(isArtifactTerminal("DRAFT")).toBe(true);
    expect(isArtifactTerminal("FAILED")).toBe(true);
    expect(isArtifactTerminal("APPROVED")).toBe(true);
    expect(isArtifactTerminal("PUBLISHED")).toBe(true);
    expect(isArtifactTerminal("ARCHIVED")).toBe(true);
    expect(getArtifactPollDelay("QUEUED")).toBe(1500);
    expect(getArtifactPollDelay("GENERATING")).toBe(1500);
    expect(getArtifactPollDelay("DRAFT")).toBeNull();
    expect(getArtifactPollDelay("FAILED")).toBeNull();
  });

  it.each(["DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"] as const)(
    "creates version + 1 in the same series from a payload-bearing %s revision",
    (status) => {
      const source = {
        id: "artifact-v2",
        seriesId: "series-1",
        courseId: "course-1",
        userId: "teacher-1",
        appType: "lesson_plan",
        title: "教案",
        prompt: "强调互动",
        payload: "{\"objectives\":[\"目标\"]}",
        inputSnapshot: "{\"context\":\"snapshot\"}",
        scope: "{\"chapterIds\":[\"chapter-1\"]}",
        sourceJobId: "job-1",
        status,
        version: 2
      };

      expect(nextArtifactRevision(source, 3)).toEqual({
        courseId: "course-1",
        userId: "teacher-1",
        appType: "lesson_plan",
        title: "教案",
        prompt: "强调互动",
        payload: "{\"objectives\":[\"目标\"]}",
        inputSnapshot: "{\"context\":\"snapshot\"}",
        scope: "{\"chapterIds\":[\"chapter-1\"]}",
        sourceJobId: "job-1",
        sourceArtifactId: "artifact-v2",
        seriesId: "series-1",
        version: 4,
        status: "DRAFT"
      });
      expect(source.status).toBe(status);
      expect(source.version).toBe(2);
    }
  );

  it("rejects revisions without materialized payload or from an active/failed generation", () => {
    const source = {
      id: "artifact-1",
      seriesId: "series-1",
      courseId: "course-1",
      userId: "teacher-1",
      appType: "courseware",
      title: "课件",
      prompt: null,
      payload: null,
      inputSnapshot: null,
      scope: null,
      sourceJobId: null,
      status: "FAILED" as const,
      version: 1
    };

    expect(() => nextArtifactRevision(source, 1)).toThrow("Only materialized artifact revisions can be edited");
    expect(() => nextArtifactRevision({ ...source, payload: "{}", status: "GENERATING" }, 1)).toThrow(
      "Only materialized artifact revisions can be edited"
    );
  });

  it("uses the server-observed series maximum instead of the selected historical version", () => {
    const source = {
      id: "artifact-v1",
      seriesId: "series-1",
      courseId: "course-1",
      userId: "teacher-1",
      appType: "lesson_plan",
      title: "历史版本",
      prompt: null,
      payload: "{}",
      inputSnapshot: null,
      scope: null,
      sourceJobId: null,
      status: "ARCHIVED" as const,
      version: 1
    };

    expect(nextArtifactRevision(source, 3).version).toBe(4);
  });
});
