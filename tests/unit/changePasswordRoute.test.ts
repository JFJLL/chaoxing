import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate
    }
  }
}));

vi.mock("@/lib/passwords", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword
}));

import { POST } from "@/app/api/auth/change-password/route";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const validBody = {
  currentPassword: "Cuc2026",
  newPassword: "NewPass2026",
  confirmPassword: "NewPass2026"
};

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "teacher-1",
      name: "教师",
      role: "TEACHER",
      institutionId: "institution-1"
    });
    mocks.userFindUnique.mockResolvedValue({ passwordHash: "hash-old" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("hash-new");
    mocks.userUpdate.mockResolvedValue({ id: "teacher-1" });
  });

  it("updates the password hash when the current password is correct", async () => {
    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      select: { passwordHash: true }
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      data: { passwordHash: "hash-new" }
    });
  });

  it("rejects a wrong current password without updating", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "当前密码错误" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation", async () => {
    const response = await POST(
      jsonRequest({ ...validBody, confirmPassword: "Different2026" })
    );

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects a new password identical to the current one", async () => {
    const response = await POST(
      jsonRequest({
        currentPassword: "Cuc2026",
        newPassword: "Cuc2026",
        confirmPassword: "Cuc2026"
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 6 characters", async () => {
    const response = await POST(
      jsonRequest({
        currentPassword: "Cuc2026",
        newPassword: "12345",
        confirmPassword: "12345"
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
