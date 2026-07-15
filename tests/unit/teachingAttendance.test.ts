import { describe, expect, it } from "vitest";
import {
  createAttendanceCredential,
  verifyAttendanceCredential
} from "@/lib/teaching/attendanceCredential";

describe("attendance credential", () => {
  const secret = "test-secret-with-enough-entropy";
  const sessionId = "session-1";
  const now = new Date("2026-07-15T03:00:29.000Z");

  it("creates a rotating token and six digit fallback code", () => {
    const credential = createAttendanceCredential({ sessionId, secret, now });

    expect(credential.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(credential.code).toMatch(/^\d{6}$/);
    expect(credential.expiresAt.toISOString()).toBe("2026-07-15T03:00:30.000Z");
  });

  it("accepts the current and immediately previous time bucket", () => {
    const current = createAttendanceCredential({ sessionId, secret, now });
    const previous = createAttendanceCredential({
      sessionId,
      secret,
      now: new Date(now.getTime() - 30_000)
    });

    expect(verifyAttendanceCredential({ sessionId, secret, value: current.token, now })).toBe(true);
    expect(verifyAttendanceCredential({ sessionId, secret, value: previous.code, now })).toBe(true);
  });

  it("rejects expired or cross-session credentials", () => {
    const credential = createAttendanceCredential({ sessionId, secret, now });
    const later = new Date(now.getTime() + 61_000);

    expect(verifyAttendanceCredential({ sessionId, secret, value: credential.token, now: later })).toBe(false);
    expect(verifyAttendanceCredential({ sessionId: "session-2", secret, value: credential.code, now })).toBe(false);
  });
});
