import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoviiError } from "../../src/lib/zovii/errors";

const mocks = vi.hoisted(() => ({
  identityFindUnique: vi.fn(),
  identityFindFirst: vi.fn(),
  identityCreate: vi.fn(),
  identityUpdate: vi.fn(),
  identityDelete: vi.fn(),
  userFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  verifyPassword: vi.fn(),
  encryptSecret: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalIdentity: {
      findUnique: mocks.identityFindUnique,
      findFirst: mocks.identityFindFirst,
      create: mocks.identityCreate,
      update: mocks.identityUpdate,
      delete: mocks.identityDelete
    },
    user: {
      findUnique: mocks.userFindUnique
    },
    auditLog: {
      create: mocks.auditLogCreate
    },
    $transaction: mocks.transaction
  }
}));

vi.mock("@/lib/passwords", () => ({
  verifyPassword: mocks.verifyPassword
}));

vi.mock("../../src/lib/zovii/crypto", () => ({
  encryptSecret: mocks.encryptSecret
}));

import {
  getZoviiLinkStatus,
  linkZoviiAccount,
  sendLinkCode,
  unlinkZoviiAccount
} from "../../src/lib/zovii/linkAccount";
import { maskPhone } from "../../src/lib/zovii/display";
import { clearRateLimits } from "../../src/lib/zovii/rateLimit";

const authSession = {
  user: { id: "zovii-user-1", phone: "13800000000" },
  tokens: { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600 }
};

function txClient() {
  return {
    externalIdentity: {
      create: mocks.identityCreate,
      update: mocks.identityUpdate,
      delete: mocks.identityDelete
    },
    auditLog: {
      create: mocks.auditLogCreate
    }
  };
}

describe("sendLinkCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  it("calls Zovii send-code with purpose=login and enforces the cooldown", async () => {
    const sendCode = vi.fn().mockResolvedValue({});
    await sendLinkCode("13800000000", { sendCode } as never);
    expect(sendCode).toHaveBeenCalledWith("13800000000", "login");
    await expect(sendLinkCode("13800000000", { sendCode } as never)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
    expect(sendCode).toHaveBeenCalledTimes(1);
  });
});

describe("linkZoviiAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identityFindUnique.mockResolvedValue(null);
    mocks.identityFindFirst.mockResolvedValue(null);
    mocks.identityCreate.mockResolvedValue({ id: "identity-1" });
    mocks.encryptSecret.mockReturnValue("enc-1");
    mocks.auditLogCreate.mockResolvedValue({ id: "log-1" });
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => fn(txClient()));
  });

  it("proves control via phone-login and stores only the encrypted refresh token", async () => {
    const phoneLogin = vi.fn().mockResolvedValue(authSession);
    const result = await linkZoviiAccount(
      { userId: "user-1", phone: "13800000000", code: "123456" },
      { phoneLogin } as never
    );

    expect(phoneLogin).toHaveBeenCalledWith({ phone: "13800000000", code: "123456" });
    expect(result).toEqual({
      linked: true,
      externalUserId: "zovii-user-1",
      maskedPhone: "138****0000"
    });
    expect(mocks.identityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        provider: "ZOVII",
        externalUserId: "zovii-user-1",
        phone: "13800000000",
        encryptedCredential: "enc-1"
      })
    });
    expect(mocks.encryptSecret).toHaveBeenCalledWith("refresh-1");
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "zovii_link",
        metadata: expect.stringContaining("138****0000")
      })
    });
  });

  it("returns idempotent success when the same user already owns the Zovii account", async () => {
    mocks.identityFindUnique.mockResolvedValue({
      id: "identity-1",
      userId: "user-1",
      externalUserId: "zovii-user-1"
    });
    const phoneLogin = vi.fn().mockResolvedValue(authSession);

    const result = await linkZoviiAccount(
      { userId: "user-1", phone: "13800000000", code: "123456" },
      { phoneLogin } as never
    );

    expect(result.linked).toBe(true);
    expect(mocks.identityCreate).not.toHaveBeenCalled();
    expect(mocks.identityUpdate).not.toHaveBeenCalled();
  });

  it("blocks linking a Zovii account that belongs to another user without leaking identity", async () => {
    mocks.identityFindUnique.mockResolvedValue({
      id: "identity-other",
      userId: "user-other",
      externalUserId: "zovii-user-1"
    });
    const phoneLogin = vi.fn().mockResolvedValue(authSession);

    const error = await linkZoviiAccount(
      { userId: "user-1", phone: "13800000000", code: "123456" },
      { phoneLogin } as never
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "ACCOUNT_CONFLICT" });
    expect((error as Error).message).not.toContain("user-other");
    expect(mocks.identityCreate).not.toHaveBeenCalled();
  });

  it("blocks linking when the phone belongs to another account", async () => {
    mocks.identityFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "identity-by-phone",
      userId: "user-other",
      phone: "13800000000"
    });
    const phoneLogin = vi.fn().mockResolvedValue(authSession);

    await expect(
      linkZoviiAccount({ userId: "user-1", phone: "13800000000", code: "123456" }, { phoneLogin } as never)
    ).rejects.toMatchObject({ code: "ACCOUNT_CONFLICT" });
  });

  it("rejects when Zovii returns a phone that differs from the input", async () => {
    const phoneLogin = vi.fn().mockResolvedValue({
      user: { id: "zovii-user-1", phone: "13900000000" },
      tokens: { accessToken: "a", refreshToken: "r" }
    });

    await expect(
      linkZoviiAccount({ userId: "user-1", phone: "13800000000", code: "123456" }, { phoneLogin } as never)
    ).rejects.toMatchObject({ code: "PHONE_MISMATCH" });
  });

  it("maps invalid login codes to INVALID_CODE", async () => {
    const phoneLogin = vi.fn().mockRejectedValue(
      new ZoviiError("INVALID_CODE", "code is invalid", { status: 400 })
    );

    await expect(
      linkZoviiAccount({ userId: "user-1", phone: "13800000000", code: "000000" }, { phoneLogin } as never)
    ).rejects.toMatchObject({ code: "INVALID_CODE", message: "验证码错误，请检查后重试" });
  });

  it("maps unregistered phones to PHONE_NOT_REGISTERED", async () => {
    const phoneLogin = vi.fn().mockRejectedValue(
      new ZoviiError("PHONE_NOT_REGISTERED", "phone not registered", { status: 422 })
    );

    await expect(
      linkZoviiAccount({ userId: "user-1", phone: "13800000000", code: "123456" }, { phoneLogin } as never)
    ).rejects.toMatchObject({ code: "PHONE_NOT_REGISTERED" });
  });
});

describe("unlinkZoviiAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ passwordHash: "hash-1" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.identityFindFirst.mockResolvedValue({
      id: "identity-1",
      externalUserId: "zovii-user-1",
      userId: "user-1"
    });
    mocks.identityDelete.mockResolvedValue({ id: "identity-1" });
  });

  it("requires the Chaoxing password before unlinking", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(unlinkZoviiAccount({ userId: "user-1", password: "wrong" })).rejects.toMatchObject({
      code: "PASSWORD_INVALID"
    });
    expect(mocks.identityDelete).not.toHaveBeenCalled();
  });

  it("unlinks locally without touching the Zovii account", async () => {
    const result = await unlinkZoviiAccount({ userId: "user-1", password: "Correct2026" });

    expect(result.unlinked).toBe(true);
    expect(mocks.identityDelete).toHaveBeenCalledWith({ where: { id: "identity-1" } });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "zovii_unlink"
      })
    });
  });

  it("rejects when nothing is linked", async () => {
    mocks.identityFindFirst.mockResolvedValue(null);

    await expect(unlinkZoviiAccount({ userId: "user-1", password: "Correct2026" })).rejects.toMatchObject({
      code: "NOT_LINKED"
    });
  });
});

describe("getZoviiLinkStatus and maskPhone", () => {
  it("returns linked=false when no identity exists", async () => {
    mocks.identityFindFirst.mockResolvedValue(null);
    await expect(getZoviiLinkStatus("user-1")).resolves.toEqual({ linked: false });
  });

  it("returns masked phone and linkedAt when linked", async () => {
    mocks.identityFindFirst.mockResolvedValue({
      id: "identity-1",
      userId: "user-1",
      provider: "ZOVII",
      externalUserId: "zovii-user-1",
      phone: "13800000000",
      status: "LINKED",
      encryptedCredential: "enc-1",
      createdAt: new Date("2026-08-13T00:00:00.000Z")
    });

    const status = await getZoviiLinkStatus("user-1");
    expect(status).toEqual({
      linked: true,
      phone: "13800000000",
      maskedPhone: "138****0000",
      externalUserId: "zovii-user-1",
      linkedAt: "2026-08-13T00:00:00.000Z"
    });
  });

  it("masks phone numbers for display", () => {
    expect(maskPhone("13800000000")).toBe("138****0000");
    expect(maskPhone("123")).toBe("123");
  });
});
