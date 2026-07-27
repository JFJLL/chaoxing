import { describe, expect, it } from "vitest";
import { resolveNearestDriveRule } from "@/lib/courseDrive/service";

describe("course drive access inheritance", () => {
  const ancestry = ["file", "chapter", "library", "root"];

  it("denies access when no explicit rule exists", () => {
    expect(resolveNearestDriveRule(ancestry, [])).toBe("DENY");
  });

  it("inherits the nearest explicit ancestor rule", () => {
    expect(resolveNearestDriveRule(ancestry, [
      { driveFileId: "root", access: "DENY" },
      { driveFileId: "library", access: "ALLOW" }
    ])).toBe("ALLOW");
  });

  it("lets a child deny override an allowed folder", () => {
    expect(resolveNearestDriveRule(ancestry, [
      { driveFileId: "library", access: "ALLOW" },
      { driveFileId: "file", access: "DENY" }
    ])).toBe("DENY");
  });

  it("ignores invalid stored access values and keeps walking", () => {
    expect(resolveNearestDriveRule(ancestry, [
      { driveFileId: "file", access: "INHERIT" },
      { driveFileId: "library", access: "ALLOW" }
    ])).toBe("ALLOW");
  });
});
