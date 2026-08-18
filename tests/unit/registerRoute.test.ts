import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  institutionFindFirst: vi.fn(),
  institutionCreate: vi.fn(),
  hashPassword: vi.fn(),
  createSessionCookieValue: vi.fn((user: any) => `session-${user.id}`),
  getSessionCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/" }))
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate
    },
    institution: {
      findFirst: mocks.institutionFindFirst,
      create: mocks.institutionCreate
    }
  }
}));

vi.mock("@/lib/passwords", () => ({
  hashPassword: mocks.hashPassword
}));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "cx_session",
  createSessionCookieValue: mocks.createSessionCookieValue,
  getSessionCookieOptions: mocks.getSessionCookieOptions
}));

import { POST } from "@/app/api/auth/register/route";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

function formRequest(body: Record<string, string>, headers: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, val] of Object.entries(body)) {
    formData.append(key, val);
  }
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { accept: "text/html", ...headers },
    body: formData
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.institutionFindFirst.mockResolvedValue({ id: "inst-1", name: "默认机构" });
    mocks.hashPassword.mockResolvedValue("hashed-password-123");
    mocks.userCreate.mockImplementation(async ({ data }: any) => ({
      id: "user-new",
      name: data.name,
      role: data.role,
      institutionId: data.institutionId
    }));
  });

  it("registers a new user successfully with JSON and sets session cookie", async () => {
    const request = jsonRequest({
      name: "张三",
      email: "zhangsan@example.com",
      password: "Password123",
      role: "STUDENT"
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user).toEqual({
      id: "user-new",
      name: "张三",
      role: "STUDENT",
      institutionId: "inst-1"
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith("Password123");
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        name: "张三",
        email: "zhangsan@example.com",
        passwordHash: "hashed-password-123",
        role: "STUDENT",
        institutionId: "inst-1"
      },
      select: {
        id: true,
        name: true,
        role: true,
        institutionId: true
      }
    });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("cx_session=session-user-new");
  });

  it("creates a default institution if none exists", async () => {
    mocks.institutionFindFirst.mockResolvedValue(null);
    mocks.institutionCreate.mockResolvedValue({ id: "inst-created", name: "默认机构" });

    const request = jsonRequest({
      name: "李四",
      email: "lisi@example.com",
      password: "Password123"
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.institutionCreate).toHaveBeenCalled();
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          institutionId: "inst-created"
        })
      })
    );
  });

  it("registers via form submit and redirects to /space with cookie", async () => {
    const request = formRequest({
      name: "王五",
      email: "wangwu@example.com",
      password: "Password123",
      role: "TEACHER"
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/space");
    expect(response.headers.get("set-cookie")).toContain("cx_session=session-user-new");
  });

  it("returns 409 when email already exists", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "existing-user" });

    const request = jsonRequest({
      name: "已有用户",
      email: "existing@example.com",
      password: "Password123"
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("该邮箱已被注册");
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("redirects with email_exists on HTML request when email exists", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "existing-user" });

    const request = formRequest({
      name: "已有用户",
      email: "existing@example.com",
      password: "Password123"
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/register?error=email_exists");
  });

  it("returns 400 when registration form data is invalid", async () => {
    const request = jsonRequest({
      name: "",
      email: "invalid-email",
      password: "123"
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("redirects with invalid_form on HTML request when registration is invalid", async () => {
    const request = formRequest({
      name: "",
      email: "invalid-email",
      password: "123"
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/register?error=invalid_form");
  });
});
