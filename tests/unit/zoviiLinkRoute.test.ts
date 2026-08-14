import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sendLinkCode: vi.fn(),
  linkZoviiAccount: vi.fn(),
  unlinkZoviiAccount: vi.fn(),
  getZoviiLinkStatus: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/zovii/linkAccount", () => ({
  sendLinkCode: mocks.sendLinkCode,
  linkZoviiAccount: mocks.linkZoviiAccount,
  unlinkZoviiAccount: mocks.unlinkZoviiAccount,
  getZoviiLinkStatus: mocks.getZoviiLinkStatus,
  ZoviiLinkError: class ZoviiLinkError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "ZoviiLinkError";
    }
  }
}));

import { POST as linkPOST } from "@/app/api/auth/zovii/link/route";
import { POST as sendCodePOST } from "@/app/api/auth/zovii/link/send-code/route";
import { POST as unlinkPOST } from "@/app/api/auth/zovii/unlink/route";
import { GET as statusGET } from "@/app/api/auth/zovii/status/route";
import { ZoviiLinkError } from "@/lib/zovii/linkAccount";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Zovii link routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      id: "user-1",
      name: "测试用户",
      role: "STUDENT",
      institutionId: "institution-1"
    });
    mocks.linkZoviiAccount.mockResolvedValue({
      linked: true,
      externalUserId: "zovii-user-1",
      maskedPhone: "138****0000"
    });
    mocks.sendLinkCode.mockResolvedValue({ retryAfterSeconds: 0 });
    mocks.unlinkZoviiAccount.mockResolvedValue({ unlinked: true });
    mocks.getZoviiLinkStatus.mockResolvedValue({ linked: false });
  });

  it("link requires a logged-in user", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect"));
    await expect(
      linkPOST(jsonRequest("/api/auth/zovii/link", { phone: "13800000000", code: "123456" }))
    ).rejects.toThrow("redirect");
    expect(mocks.linkZoviiAccount).not.toHaveBeenCalled();
  });

  it("links successfully and returns the masked result", async () => {
    const response = await linkPOST(
      jsonRequest("/api/auth/zovii/link", { phone: "13800000000", code: "123456" })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      linked: true,
      externalUserId: "zovii-user-1",
      maskedPhone: "138****0000"
    });
    expect(mocks.linkZoviiAccount).toHaveBeenCalledWith({
      userId: "user-1",
      phone: "13800000000",
      code: "123456"
    });
  });

  it("maps invalid codes to 400", async () => {
    mocks.linkZoviiAccount.mockRejectedValue(new ZoviiLinkError("INVALID_CODE", "验证码错误，请检查后重试"));

    const response = await linkPOST(
      jsonRequest("/api/auth/zovii/link", { phone: "13800000000", code: "000000" })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "验证码错误，请检查后重试",
      code: "INVALID_CODE"
    });
  });

  it("maps account conflicts to 409 without leaking other-account details", async () => {
    mocks.linkZoviiAccount.mockRejectedValue(
      new ZoviiLinkError("ACCOUNT_CONFLICT", "该 Zovii 账号已关联其他平台账号，无法重复关联")
    );

    const response = await linkPOST(
      jsonRequest("/api/auth/zovii/link", { phone: "13800000000", code: "123456" })
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).not.toContain("user-other");
  });

  it("validates phone and code shape before calling the service", async () => {
    const response = await linkPOST(
      jsonRequest("/api/auth/zovii/link", { phone: "123", code: "12" })
    );
    expect(response.status).toBe(400);
    expect(mocks.linkZoviiAccount).not.toHaveBeenCalled();
  });

  it("send-code maps rate limits to 429", async () => {
    mocks.sendLinkCode.mockRejectedValue(new ZoviiLinkError("RATE_LIMITED", "发送过于频繁"));

    const response = await sendCodePOST(
      jsonRequest("/api/auth/zovii/link/send-code", { phone: "13800000000" })
    );
    expect(response.status).toBe(429);
  });

  it("unlink maps wrong password to 400", async () => {
    mocks.unlinkZoviiAccount.mockRejectedValue(new ZoviiLinkError("PASSWORD_INVALID", "当前密码错误"));

    const response = await unlinkPOST(jsonRequest("/api/auth/zovii/unlink", { password: "wrong" }));
    expect(response.status).toBe(400);
  });

  it("unlink requires a password", async () => {
    const response = await unlinkPOST(jsonRequest("/api/auth/zovii/unlink", { password: "" }));
    expect(response.status).toBe(400);
    expect(mocks.unlinkZoviiAccount).not.toHaveBeenCalled();
  });

  it("unlink succeeds with a valid password", async () => {
    const response = await unlinkPOST(jsonRequest("/api/auth/zovii/unlink", { password: "Correct2026" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, unlinked: true });
  });

  it("status returns the link state for the current user", async () => {
    mocks.getZoviiLinkStatus.mockResolvedValue({
      linked: true,
      maskedPhone: "138****0000"
    });

    const response = await statusGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: { linked: true, maskedPhone: "138****0000" }
    });
  });
});
