import { describe, expect, it } from "vitest";
import { classifyNoticeStatus, normalizeNoticePublishAt } from "@/lib/teaching/notices";

describe("teaching notice rules", () => {
  it("separates scheduled notices from effective published notices", () => {
    const now = new Date("2026-07-15T08:00:00.000Z");
    expect(classifyNoticeStatus({ status: "PUBLISHED", publishAt: new Date("2026-07-15T09:00:00.000Z") }, now)).toBe("SCHEDULED");
    expect(classifyNoticeStatus({ status: "PUBLISHED", publishAt: new Date("2026-07-15T07:00:00.000Z") }, now)).toBe("PUBLISHED");
    expect(classifyNoticeStatus({ status: "DRAFT", publishAt: null }, now)).toBe("DRAFT");
  });

  it("records the real publish time when a draft is published immediately", () => {
    const now = new Date("2026-07-15T08:00:00.000Z");
    expect(normalizeNoticePublishAt({ nextStatus: "PUBLISHED", previousStatus: "DRAFT", requestedPublishAt: null }, now)).toEqual(now);
    expect(normalizeNoticePublishAt({ nextStatus: "DRAFT", previousStatus: "DRAFT", requestedPublishAt: null }, now)).toBeNull();
    expect(normalizeNoticePublishAt({ nextStatus: undefined, previousStatus: "PUBLISHED", requestedPublishAt: undefined }, now)).toBeUndefined();
  });
});
