import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  refresh: vi.fn(),
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      mocks.effects.push(effect);
    },
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initial: T | (() => T)) => {
      const setter = vi.fn();
      mocks.stateSetters.push(setter);
      return [typeof initial === "function" ? (initial as () => T)() : initial, setter] as const;
    }
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => ({ get: () => null })
}));

import { AttendanceClient } from "../../src/components/course-workspace/AttendanceClient";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const activeSession = {
  id: "session-1",
  title: "课堂签到",
  status: "ACTIVE",
  startsAt: "2026-07-17T01:00:00.000Z",
  endsAt: "2099-07-17T01:10:00.000Z",
  records: []
};

function renderAttendance(sessions = [activeSession]) {
  AttendanceClient({
    courseId: "course-1",
    canManage: true,
    sessions,
    students: [{ id: "student-1", name: "学习者" }]
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.effects.length = 0;
  mocks.stateSetters.length = 0;
  vi.stubGlobal("window", {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    location: { origin: "http://localhost" }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AttendanceClient polling", () => {
  it("polls attendance data without refreshing the whole route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessions: [{
        ...activeSession,
        records: [{
          userId: "student-1",
          status: "PRESENT",
          signedAt: "2026-07-17T01:01:00.000Z",
          user: { id: "student-1", name: "学习者" }
        }]
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    renderAttendance();
    const cleanup = mocks.effects[1]?.();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/attendance",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    cleanup?.();
  });

  it("stops refreshing the token after course management permission is lost", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "无权管理课程" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    renderAttendance();
    const cleanup = mocks.effects[2]?.();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/course-1/attendance/session-1/token",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) })
    );
    cleanup?.();
  });

  it("stops roster polling when the server reports a changed manager identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      canManage: false,
      sessions: []
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    renderAttendance();
    const cleanup = mocks.effects[1]?.();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    cleanup?.();
  });

  it("replaces stale sessions when server props change", () => {
    const nextSession = { ...activeSession, id: "session-2", title: "新课程签到" };
    renderAttendance([nextSession]);
    mocks.effects[0]?.();

    const update = mocks.stateSetters[3].mock.calls[0][0];
    const result = typeof update === "function" ? update([activeSession]) : update;

    expect(result.map((session: { id: string }) => session.id)).toEqual(["session-2"]);
  });
});
