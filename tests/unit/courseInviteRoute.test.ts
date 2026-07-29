import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findInvite: vi.fn(),
  redeemInviteCode: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({
  db: { inviteCode: { findUnique: mocks.findInvite } }
}));
vi.mock("@/lib/modules/inviteCodes", () => ({
  redeemInviteCode: mocks.redeemInviteCode
}));

import { POST } from "@/app/api/invite/route";

describe("POST /api/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
  });

  it("redeems a student course code through the enrollment flow", async () => {
    mocks.findInvite.mockResolvedValue({ kind: "COURSE" });
    mocks.redeemInviteCode.mockResolvedValue({ kind: "COURSE" });

    const response = await POST(new Request("http://localhost/api/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: " COURSE-123 " })
    }) as never);

    expect(response.status).toBe(200);
    expect(mocks.findInvite).toHaveBeenCalledWith({
      where: { code: "COURSE-123" },
      select: { kind: true }
    });
    expect(mocks.redeemInviteCode).toHaveBeenCalledWith(expect.objectContaining({ id: "student-1" }), " COURSE-123 ");
  });

  it("rejects teacher collaboration codes before any enrollment redemption", async () => {
    mocks.findInvite.mockResolvedValue({ kind: "COURSE_COLLABORATOR" });

    const response = await POST(new Request("http://localhost/api/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "TC-ABC" })
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "课程邀请码无效" });
    expect(mocks.redeemInviteCode).not.toHaveBeenCalled();
  });

  it("rejects teachers using a valid student enrollment code", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.findInvite.mockResolvedValue({ kind: "COURSE" });

    const response = await POST(new Request("http://localhost/api/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "COURSE-123" })
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "只有学生可以使用课程邀请码加入学习课程" });
    expect(mocks.findInvite).not.toHaveBeenCalled();
    expect(mocks.redeemInviteCode).not.toHaveBeenCalled();
  });
});
