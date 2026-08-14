import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  registerWithZovii: vi.fn(),
  sendRegistrationCode: vi.fn(),
  createSessionCookieValue: vi.fn(),
  getSessionCookieOptions: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  createSessionCookieValue: mocks.createSessionCookieValue,
  getSessionCookieOptions: mocks.getSessionCookieOptions,
  SESSION_COOKIE: "cx_session"
}));

vi.mock("@/lib/zovii/registration", () => ({
  registerWithZovii: mocks.registerWithZovii,
  sendRegistrationCode: mocks.sendRegistrationCode,
  RegistrationError: class RegistrationError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "RegistrationError";
    }
  },
  toSessionUser: (user: { id: string; name: string; role: string; institutionId: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    institutionId: user.institutionId
  })
}));

import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as sendCodePOST } from "@/app/api/auth/register/send-code/route";
import { RegistrationError } from "@/lib/zovii/registration";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const validBody = {
  phone: "13800000000",
  code: "123456",
  name: "新同学",
  email: "new.student@example.com",
  password: "StudentPass2026",
  confirmPassword: "StudentPass2026"
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerWithZovii.mockResolvedValue({
      user: {
        id: "user-1",
        name: "新同学",
        email: "new.student@example.com",
        phone: "13800000000",
        role: "STUDENT",
        institutionId: "institution-1"
      },
      recovered: false
    });
    mocks.createSessionCookieValue.mockReturnValue("session-value");
    mocks.getSessionCookieOptions.mockReturnValue({ httpOnly: true, path: "/" });
  });

  it("creates the session and returns the user on success", async () => {
    const response = await registerPOST(jsonRequest("/api/auth/register", validBody));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { user: { id: string } };
    expect(payload.user.id).toBe("user-1");
    expect(response.cookies.get("cx_session")?.value).toBe("session-value");
    expect(mocks.registerWithZovii).toHaveBeenCalledWith(validBody);
  });

  it("rejects an invalid code with a 400 and no session", async () => {
    mocks.registerWithZovii.mockRejectedValue(new RegistrationError("INVALID_CODE", "验证码错误，请检查后重试"));

    const response = await registerPOST(jsonRequest("/api/auth/register", validBody));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "验证码错误，请检查后重试",
      code: "INVALID_CODE"
    });
    expect(response.cookies.get("cx_session")).toBeUndefined();
  });

  it("maps PHONE_EXISTS_ON_ZOVII to 409", async () => {
    mocks.registerWithZovii.mockRejectedValue(new RegistrationError("PHONE_EXISTS_ON_ZOVII", "该手机号已注册 Zovii 账号"));

    const response = await registerPOST(jsonRequest("/api/auth/register", validBody));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "该手机号已注册 Zovii 账号",
      code: "PHONE_EXISTS_ON_ZOVII"
    });
  });

  it("maps OPERATION_IN_FLIGHT to 409", async () => {
    mocks.registerWithZovii.mockRejectedValue(new RegistrationError("OPERATION_IN_FLIGHT", "注册请求正在处理中"));

    const response = await registerPOST(jsonRequest("/api/auth/register", validBody));
    expect(response.status).toBe(409);
  });

  it("maps RECOVERY_CODE_SENT to 409 so the page can start the countdown", async () => {
    mocks.registerWithZovii.mockRejectedValue(
      new RegistrationError("RECOVERY_CODE_SENT", "已发送新的登录验证码，请输入后重新提交")
    );

    const response = await registerPOST(jsonRequest("/api/auth/register", validBody));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "已发送新的登录验证码，请输入后重新提交",
      code: "RECOVERY_CODE_SENT"
    });
  });

  it("maps RATE_LIMITED to 429", async () => {
    mocks.registerWithZovii.mockRejectedValue(new RegistrationError("RATE_LIMITED", "操作过于频繁"));

    const response = await registerPOST(jsonRequest("/api/auth/register", validBody));
    expect(response.status).toBe(429);
  });

  it("rejects validation failures without calling the service", async () => {
    const response = await registerPOST(
      jsonRequest("/api/auth/register", { ...validBody, phone: "123" })
    );

    expect(response.status).toBe(400);
    expect(mocks.registerWithZovii).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const response = await registerPOST(
      jsonRequest("/api/auth/register", { ...validBody, confirmPassword: "Different2026" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "两次输入的密码不一致" });
  });
});

describe("POST /api/auth/register/send-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendRegistrationCode.mockResolvedValue({ retryAfterSeconds: 0 });
  });

  it("sends the code and returns ok", async () => {
    const response = await sendCodePOST(jsonRequest("/api/auth/register/send-code", { phone: "13800000000" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.sendRegistrationCode).toHaveBeenCalledWith("13800000000");
  });

  it("rejects an invalid phone number", async () => {
    const response = await sendCodePOST(jsonRequest("/api/auth/register/send-code", { phone: "12345" }));
    expect(response.status).toBe(400);
    expect(mocks.sendRegistrationCode).not.toHaveBeenCalled();
  });

  it("maps rate limits to 429", async () => {
    mocks.sendRegistrationCode.mockRejectedValue(new RegistrationError("RATE_LIMITED", "发送过于频繁，请 60 秒后重试"));
    const response = await sendCodePOST(jsonRequest("/api/auth/register/send-code", { phone: "13800000000" }));
    expect(response.status).toBe(429);
  });
});
