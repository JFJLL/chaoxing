import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoviiError } from "../../src/lib/zovii/errors";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  identityFindUnique: vi.fn(),
  identityCreate: vi.fn(),
  opFindFirst: vi.fn(),
  opFindUnique: vi.fn(),
  opCreate: vi.fn(),
  opUpdate: vi.fn(),
  institutionFindFirst: vi.fn(),
  institutionCreate: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  encryptSecret: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate
    },
    externalIdentity: {
      findUnique: mocks.identityFindUnique,
      create: mocks.identityCreate
    },
    externalOperation: {
      findFirst: mocks.opFindFirst,
      findUnique: mocks.opFindUnique,
      create: mocks.opCreate,
      update: mocks.opUpdate
    },
    institution: {
      findFirst: mocks.institutionFindFirst,
      create: mocks.institutionCreate
    },
    $transaction: mocks.transaction
  }
}));

vi.mock("@/lib/passwords", () => ({
  hashPassword: mocks.hashPassword
}));

vi.mock("../../src/lib/zovii/crypto", () => ({
  encryptSecret: mocks.encryptSecret
}));

import {
  registerWithZovii,
  RegistrationError,
  registrationIdempotencyKey,
  sendRegistrationCode
} from "../../src/lib/zovii/registration";
import { clearRateLimits } from "../../src/lib/zovii/rateLimit";
import type { ZoviiClient } from "../../src/lib/zovii/client";

const validInput = {
  phone: "13800000000",
  code: "123456",
  name: "新同学",
  email: "new.student@example.com",
  password: "StudentPass2026"
};

const authSession = {
  user: { id: "zovii-user-new", phone: "13800000000" },
  tokens: { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600 }
};

function pendingOperation() {
  return {
    id: "op-1",
    kind: "REGISTER_LINK",
    idempotencyKey: "register:13800000000:abc",
    status: "PENDING",
    externalRequestId: null,
    result: null,
    errorCode: null,
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function txClient() {
  return {
    user: { create: mocks.userCreate },
    externalIdentity: { create: mocks.identityCreate }
  };
}

describe("registerWithZovii", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.identityFindUnique.mockResolvedValue(null);
    mocks.opFindFirst.mockResolvedValue(null);
    mocks.opFindUnique.mockResolvedValue(null);
    mocks.opCreate.mockResolvedValue(pendingOperation());
    mocks.institutionFindFirst.mockResolvedValue({ id: "institution-1" });
    mocks.hashPassword.mockResolvedValue("hash-1");
    mocks.encryptSecret.mockReturnValue("enc-1");
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => fn(txClient()));
    mocks.userCreate.mockResolvedValue({
      id: "user-new",
      name: validInput.name,
      email: validInput.email,
      phone: validInput.phone,
      role: "STUDENT",
      institutionId: "institution-1"
    });
  });

  it("rejects when the phone already has a Chaoxing account", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "existing" });
    const register = vi.fn();
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "PHONE_TAKEN"
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects when the email is already used", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-by-email" });
    const register = vi.fn();
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "EMAIL_TAKEN"
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("directs to the link flow when the phone already exists on Zovii", async () => {
    mocks.identityFindUnique.mockResolvedValue({ id: "identity-1" });
    const register = vi.fn();
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "PHONE_EXISTS_ON_ZOVII"
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("registers on Zovii first, then creates the local account and identity", async () => {
    const register = vi.fn().mockResolvedValue(authSession);
    const client = { register } as unknown as ZoviiClient;

    const result = await registerWithZovii(validInput, client);

    expect(register).toHaveBeenCalledWith({
      phone: validInput.phone,
      code: validInput.code,
      password: validInput.password,
      username: validInput.name
    });
    expect(result.user).toMatchObject({
      id: "user-new",
      role: "STUDENT",
      institutionId: "institution-1"
    });
    expect(result.recovered).toBe(false);
    expect(mocks.encryptSecret).toHaveBeenCalledWith("refresh-1");
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          result: expect.stringContaining("zovii-user-new")
        })
      })
    );
    expect(mocks.userCreate).toHaveBeenCalled();
    expect(mocks.identityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "ZOVII",
        externalUserId: "zovii-user-new",
        phone: validInput.phone,
        encryptedCredential: "enc-1"
      })
    });
  });

  it("maps invalid codes to INVALID_CODE and marks the operation failed", async () => {
    const register = vi.fn().mockRejectedValue(
        new ZoviiError("INVALID_CODE", "code is invalid", { status: 400 })
    );
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "INVALID_CODE",
      message: "验证码错误，请检查后重试"
    });
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", errorCode: "INVALID_CODE" })
      })
    );
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("maps Zovii phone-already-registered to PHONE_EXISTS_ON_ZOVII", async () => {
    const register = vi.fn().mockRejectedValue(
        new ZoviiError("PHONE_ALREADY_REGISTERED", "phone already registered", { status: 409 })
    );
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "PHONE_EXISTS_ON_ZOVII"
    });
  });

  it("blocks duplicate concurrent submits with OPERATION_IN_FLIGHT", async () => {
    mocks.opFindUnique.mockResolvedValue(pendingOperation());
    const register = vi.fn();
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "OPERATION_IN_FLIGHT"
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("maps an exhausted attempt budget to RATE_LIMITED", async () => {
    mocks.opFindUnique.mockResolvedValue({
      ...pendingOperation(),
      status: "FAILED",
      attempts: 10,
      updatedAt: new Date()
    });
    const register = vi.fn();
    const client = { register } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "验证码尝试次数过多，请稍后再试"
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("first recovery attempt sends a login-purpose code and asks the user for it", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({
        externalUserId: "zovii-user-old",
        phone: validInput.phone,
        name: validInput.name,
        email: validInput.email,
        passwordHash: "hash-old",
        institutionId: "institution-1",
        encryptedCredential: "enc-old",
        credentialUpdatedAt: "2026-08-13T00:00:00.000Z"
      })
    });
    const sendCode = vi.fn().mockResolvedValue({});
    const phoneLogin = vi.fn();
    const register = vi.fn();
    const client = { register, phoneLogin, sendCode } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "RECOVERY_CODE_SENT"
    });

    expect(register).not.toHaveBeenCalled();
    expect(phoneLogin).not.toHaveBeenCalled();
    expect(sendCode).toHaveBeenCalledWith(validInput.phone, "login");
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.stringContaining("recoveryCodeSentAt")
        })
      })
    );
  });

  it("recovers once the login-purpose code is provided", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({
        externalUserId: "zovii-user-old",
        phone: validInput.phone,
        name: validInput.name,
        email: validInput.email,
        passwordHash: "hash-old",
        institutionId: "institution-1",
        encryptedCredential: "enc-old",
        credentialUpdatedAt: "2026-08-13T00:00:00.000Z",
        recoveryCodeSentAt: new Date().toISOString()
      })
    });
    const phoneLogin = vi.fn().mockResolvedValue({
      user: { id: "zovii-user-old", phone: validInput.phone },
      tokens: { accessToken: "a", refreshToken: "r" }
    });
    const sendCode = vi.fn();
    const register = vi.fn();
    const client = { register, phoneLogin, sendCode } as unknown as ZoviiClient;

    const result = await registerWithZovii(validInput, client);

    expect(register).not.toHaveBeenCalled();
    expect(sendCode).not.toHaveBeenCalled();
    expect(phoneLogin).toHaveBeenCalledWith({
      phone: validInput.phone,
      code: validInput.code
    });
    expect(result.recovered).toBe(true);
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: validInput.phone,
        passwordHash: "hash-1",
        role: "STUDENT",
        institutionId: "institution-1"
      })
    });
    expect(mocks.identityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalUserId: "zovii-user-old",
        encryptedCredential: "enc-1"
      })
    });
  });

  it("recovers a stranded PENDING operation when Zovii rejects the duplicate register", async () => {
    mocks.opFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...pendingOperation(),
        idempotencyKey: "register:13800000000:old-hash",
        result: null
      });
    const sendCode = vi.fn().mockResolvedValue({});
    const register = vi.fn().mockRejectedValue(
      new ZoviiError("PHONE_ALREADY_REGISTERED", "phone already registered", { status: 409 })
    );
    const phoneLogin = vi.fn();
    const client = { register, phoneLogin, sendCode } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "RECOVERY_CODE_SENT"
    });
    expect(phoneLogin).not.toHaveBeenCalled();
    expect(sendCode).toHaveBeenCalledWith(validInput.phone, "login");
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("retry with the login code completes a stranded PENDING recovery", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({ recoveryCodeSentAt: new Date().toISOString() })
    });
    const phoneLogin = vi.fn().mockResolvedValue({
      user: { id: "zovii-stranded", phone: validInput.phone },
      tokens: { accessToken: "a", refreshToken: "r" }
    });
    const client = { register: vi.fn(), phoneLogin, sendCode: vi.fn() } as unknown as ZoviiClient;

    const result = await registerWithZovii(validInput, client);

    expect(result.recovered).toBe(true);
    expect(phoneLogin).toHaveBeenCalledWith({
      phone: validInput.phone,
      code: validInput.code
    });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: validInput.phone,
        passwordHash: "hash-1",
        role: "STUDENT"
      })
    });
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" })
      })
    );
  });

  it("refuses recovery when the retry uses a different email than the existing account", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({
        externalUserId: "zovii-user-old",
        phone: validInput.phone,
        name: validInput.name,
        email: validInput.email,
        recoveryCodeSentAt: new Date().toISOString()
      })
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-existing",
      name: "已有用户",
      email: "other@example.com",
      phone: validInput.phone,
      role: "STUDENT",
      institutionId: "institution-1"
    });
    const phoneLogin = vi.fn().mockResolvedValue({
      user: { id: "zovii-user-old", phone: validInput.phone },
      tokens: { accessToken: "a", refreshToken: "r" }
    });
    const client = { register: vi.fn(), phoneLogin, sendCode: vi.fn() } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "PHONE_TAKEN"
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("never recovers without a valid Zovii code (no login bypass)", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({
        externalUserId: "zovii-user-old",
        phone: validInput.phone,
        name: validInput.name,
        email: validInput.email,
        passwordHash: "hash-old",
        institutionId: "institution-1",
        encryptedCredential: "enc-old",
        credentialUpdatedAt: "2026-08-13T00:00:00.000Z",
        recoveryCodeSentAt: new Date().toISOString()
      })
    });
    const phoneLogin = vi.fn().mockRejectedValue(
      new ZoviiError("INVALID_CODE", "code is invalid", { status: 400 })
    );
    const client = { register: vi.fn(), phoneLogin } as unknown as ZoviiClient;
    mocks.opUpdate.mockResolvedValue({ id: "op-1", attempts: 1 });
    mocks.opFindUnique.mockResolvedValue({ ...pendingOperation(), attempts: 1 });

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "INVALID_CODE",
      message: "验证码错误，请检查后重试"
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.identityCreate).not.toHaveBeenCalled();
  });

  it("locks recovery attempts after too many wrong codes", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({
        externalUserId: "zovii-user-old",
        phone: validInput.phone,
        name: validInput.name,
        email: validInput.email,
        recoveryCodeSentAt: new Date().toISOString()
      })
    });
    const phoneLogin = vi.fn().mockRejectedValue(
      new ZoviiError("INVALID_CODE", "code is invalid", { status: 400 })
    );
    const client = { register: vi.fn(), phoneLogin } as unknown as ZoviiClient;
    mocks.opUpdate.mockResolvedValue({ id: "op-1", attempts: 10 });
    mocks.opFindUnique.mockResolvedValue({ ...pendingOperation(), attempts: 10 });

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "验证码尝试次数过多，请稍后再试"
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("rejects recovery when the Zovii account id differs from the record", async () => {
    mocks.opFindFirst.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      idempotencyKey: "register:13800000000:old-hash",
      result: JSON.stringify({
        externalUserId: "zovii-user-old",
        phone: validInput.phone,
        name: validInput.name,
        email: validInput.email,
        passwordHash: "hash-old",
        institutionId: "institution-1",
        encryptedCredential: "enc-old",
        credentialUpdatedAt: "2026-08-13T00:00:00.000Z",
        recoveryCodeSentAt: new Date().toISOString()
      })
    });
    const phoneLogin = vi.fn().mockResolvedValue({
      user: { id: "zovii-user-other", phone: validInput.phone },
      tokens: { accessToken: "a", refreshToken: "r" }
    });
    const client = { register: vi.fn(), phoneLogin } as unknown as ZoviiClient;

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "ZOVII_ERROR"
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("reports LOCAL_RECOVERY_FAILED when local creation fails after Zovii succeeded", async () => {
    const register = vi.fn().mockResolvedValue(authSession);
    const client = { register } as unknown as ZoviiClient;
    mocks.transaction.mockRejectedValue(new Error("sqlite locked"));

    await expect(registerWithZovii(validInput, client)).rejects.toMatchObject({
      code: "LOCAL_RECOVERY_FAILED"
    });
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" })
      })
    );
  });
});

describe("sendRegistrationCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  it("calls Zovii send-code with purpose=register and enforces a 60s cooldown", async () => {
    const sendCode = vi.fn().mockResolvedValue({});
    const client = { sendCode } as unknown as ZoviiClient;

    await sendRegistrationCode("13800000000", client);
    expect(sendCode).toHaveBeenCalledWith("13800000000", "register");

    await expect(sendRegistrationCode("13800000000", client)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
    expect(sendCode).toHaveBeenCalledTimes(1);
  });

  it("enforces the hourly cap", async () => {
    const sendCode = vi.fn().mockResolvedValue({});
    const client = { sendCode } as unknown as ZoviiClient;
    let i = 0;
    for (; i < 5; i += 1) {
      await sendRegistrationCode("13800000000", client);
      clearRateLimits();
    }
    await sendRegistrationCode("13800000000", client);
    await expect(sendRegistrationCode("13800000000", client)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
  });
});

describe("registrationIdempotencyKey", () => {
  it("derives a stable key from phone and email", () => {
    const first = registrationIdempotencyKey("13800000000", "A@example.com");
    const second = registrationIdempotencyKey("13800000000", "a@example.com");
    expect(first).toBe(second);
    expect(first.startsWith("register:13800000000:")).toBe(true);
  });
});
