import { createHash } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { ZoviiClient } from "./client";
import { encryptSecret } from "./crypto";
import { classifyAuthZoviiError, ZoviiError, toUserMessage } from "./errors";
import { claimOperation, completeOperation, OP_KINDS, OP_STATUS } from "./idempotency";
import { sendPlatformCode } from "./sendCode";
import type { SessionUser } from "@/lib/auth";

export type RegistrationErrorCode =
  | "PHONE_TAKEN"
  | "EMAIL_TAKEN"
  | "PHONE_EXISTS_ON_ZOVII"
  | "PHONE_NOT_REGISTERED"
  | "INVALID_CODE"
  | "RATE_LIMITED"
  | "ZOVII_ERROR"
  | "OPERATION_IN_FLIGHT"
  | "LOCAL_RECOVERY_FAILED"
  | "RECOVERY_CODE_SENT";

export class RegistrationError extends Error {
  constructor(
    readonly code: RegistrationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

export function defaultZoviiClient(): ZoviiClient {
  return new ZoviiClient();
}

export function registrationIdempotencyKey(phone: string, email: string): string {
  const emailHash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
  return `register:${phone}:${emailHash}`;
}

export async function sendRegistrationCode(phone: string, client: ZoviiClient = defaultZoviiClient()): Promise<{ retryAfterSeconds: number }> {
  return sendPlatformCode(phone, "register", "register", client, (message) => {
    throw new RegistrationError("RATE_LIMITED", message);
  });
}

type RegisterInput = {
  phone: string;
  code: string;
  name: string;
  email: string;
  password: string;
};

export type RegisteredUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  institutionId: string;
};

export function toSessionUser(user: RegisteredUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    institutionId: user.institutionId
  };
}

type RegistrationResult = {
  user: RegisteredUser;
  recovered: boolean;
};

async function resolveInstitutionId(): Promise<string> {
  const existing = await db.institution.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing.id;
  const created = await db.institution.create({
    data: { name: "默认学校", branding: null }
  });
  return created.id;
}

async function createLocalAccount(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  externalUserId: string;
  encryptedCredential: string;
}): Promise<RegisteredUser> {
  const institutionId = await resolveInstitutionId();
  const passwordHash = await hashPassword(input.password);
  return persistLocalAccount({
    name: input.name,
    email: input.email,
    phone: input.phone,
    passwordHash,
    role: "STUDENT",
    institutionId,
    externalUserId: input.externalUserId,
    encryptedCredential: input.encryptedCredential
  });
}

async function persistLocalAccount(record: {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: string;
  institutionId: string;
  externalUserId: string;
  encryptedCredential?: string;
}): Promise<RegisteredUser> {
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: record.name,
        email: record.email,
        phone: record.phone,
        passwordHash: record.passwordHash,
        role: record.role,
        institutionId: record.institutionId
      }
    });
    await tx.externalIdentity.create({
      data: {
        userId: created.id,
        provider: "ZOVII",
        externalUserId: record.externalUserId,
        phone: record.phone,
        status: "LINKED",
        ...(record.encryptedCredential
          ? {
              encryptedCredential: record.encryptedCredential,
              credentialUpdatedAt: new Date()
            }
          : {})
      }
    });
    return created;
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? record.phone,
    role: user.role as "STUDENT",
    institutionId: user.institutionId
  };
}

/**
 * Registers a new user on both platforms in one flow:
 * 1. Zovii validates phone + code and creates the Zovii account.
 * 2. Only after Zovii succeeds, the Chaoxing account is created locally.
 * A successful Zovii registration is recorded in the operation ledger (with a
 * sanitized result — no password hash, no credential material) so a retry can
 * finish the local account without ever calling Zovii register twice.
 */
export async function registerWithZovii(input: RegisterInput, client: ZoviiClient = defaultZoviiClient()): Promise<RegistrationResult> {
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();

  const earlierSuccess = await db.externalOperation.findFirst({
    where: {
      kind: OP_KINDS.REGISTER_LINK,
      idempotencyKey: { startsWith: `register:${phone}:` },
      OR: [
        { status: "SUCCEEDED" },
        { status: "PENDING", result: { contains: "recoveryCodeSentAt" } }
      ]
    }
  });
  if (earlierSuccess) {
    return recoverRegistrationViaCode(earlierSuccess, phone, input.code, input.password, input.name, email, client);
  }

  const existingUserByPhone = await db.user.findUnique({ where: { phone } });
  if (existingUserByPhone) {
    throw new RegistrationError("PHONE_TAKEN", "该手机号已注册 Chaoxing 账号，请直接登录");
  }
  const existingUserByEmail = await db.user.findUnique({ where: { email } });
  if (existingUserByEmail) {
    throw new RegistrationError("EMAIL_TAKEN", "该邮箱已被使用，请更换邮箱或直接登录");
  }

  const existingIdentity = await db.externalIdentity.findUnique({
    where: { provider_phone: { provider: "ZOVII", phone } }
  });
  if (existingIdentity) {
    throw new RegistrationError("PHONE_EXISTS_ON_ZOVII", "该手机号已注册 Zovii 账号，可登录后关联已有账号");
  }

  const idempotencyKey = registrationIdempotencyKey(phone, email);
  const claim = await claimOperation({
    kind: OP_KINDS.REGISTER_LINK,
    idempotencyKey,
    // The crash window between Zovii register success and the ledger commit is
    // sub-second; a short TTL lets a stranded retry recover quickly instead of
    // being stuck with "in flight" for minutes.
    pendingTtlMs: 30_000
  });

  if (claim.state === "in_flight") {
    throw new RegistrationError(
      "OPERATION_IN_FLIGHT",
      "注册请求正在处理中；若刚才的提交已中断，请 30 秒后重试以自动恢复"
    );
  }

  if (claim.state === "exhausted") {
    throw new RegistrationError("RATE_LIMITED", "验证码尝试次数过多，请稍后再试");
  }

  if (claim.state === "replayed") {
    return recoverRegistrationViaCode(claim.operation, phone, input.code, input.password, input.name, email, client);
  }

  const operationId = claim.operation.id;
  let session;
  try {
    session = await client.register({
      phone,
      code: input.code,
      password: input.password,
      username: input.name
    });
  } catch (error) {
    if (error instanceof ZoviiError && error.code === "PHONE_ALREADY_REGISTERED") {
      const stranded = await db.externalOperation.findFirst({
        where: {
          kind: OP_KINDS.REGISTER_LINK,
          idempotencyKey: { startsWith: `register:${phone}:` }
        }
      });
      if (stranded) {
        return recoverRegistrationViaCode(stranded, phone, input.code, input.password, input.name, email, client);
      }
    }
    const mapped = mapZoviiRegistrationError(error);
    await completeOperation(operationId, {
      status: OP_STATUS.FAILED,
      errorCode: mapped.code,
      errorMessage: mapped.message
    }).catch(() => undefined);
    throw mapped;
  }

  const institutionId = await resolveInstitutionId();
  const encryptedCredential = encryptSecret(session.tokens.refreshToken);

  await completeOperation(operationId, {
    status: OP_STATUS.SUCCEEDED,
    result: {
      externalUserId: session.user.id,
      phone,
      name: input.name,
      email
    }
  });

  try {
    const user = await createLocalAccount({
      name: input.name,
      email,
      phone,
      password: input.password,
      externalUserId: session.user.id,
      encryptedCredential
    });
    return { user, recovered: false };
  } catch (error) {
    throw new RegistrationError(
      "LOCAL_RECOVERY_FAILED",
      "Zovii 账号已创建，本地账号写入失败；请使用相同手机号和邮箱重试一次以完成注册，不会重复创建 Zovii 账号"
    );
  }
}

/**
 * Recovers a locally-incomplete registration. Control of the Zovii account is
 * always proven with a fresh login-purpose code verified by Zovii phone-login;
 * the ledger stores no password hash or credential material. Works even when
 * the operation record is missing or PENDING (crash between Zovii success and
 * the ledger commit): the Zovii-409 path finds the stranded operation and the
 * login-purpose code is still verified via phone-login before any local
 * account is created.
 */
async function recoverRegistrationViaCode(
  operation: { id: string; result: string | null } | null,
  phone: string,
  code: string,
  password: string,
  name: string,
  email: string,
  client: ZoviiClient
): Promise<RegistrationResult> {
  type RecoveryRecord = {
    externalUserId?: string;
    phone?: string;
    email?: string;
    recoveryCodeSentAt?: string;
  };
  let record: RecoveryRecord | null = null;
  if (operation?.result) {
    try {
      record = JSON.parse(operation.result) as RecoveryRecord;
    } catch {
      record = null;
    }
  }
  if (record && record.phone !== undefined && record.phone !== phone) {
    throw new RegistrationError("LOCAL_RECOVERY_FAILED", "注册记录与当前手机号不一致");
  }
  if (record && record.email && record.email !== email) {
    throw new RegistrationError(
      "LOCAL_RECOVERY_FAILED",
      "注册记录与提交的邮箱不一致，请使用原手机号和邮箱重试"
    );
  }

  const recoveryCodeSentAt = record?.recoveryCodeSentAt ? new Date(record.recoveryCodeSentAt).getTime() : 0;
  const codeStillValid = Date.now() - recoveryCodeSentAt < 10 * 60 * 1000;
  if (!codeStillValid) {
    await client.sendCode(phone, "login");
    if (operation) {
      await db.externalOperation.update({
        where: { id: operation.id },
        data: {
          result: JSON.stringify({ ...(record ?? {}), recoveryCodeSentAt: new Date().toISOString() })
        }
      });
    }
    throw new RegistrationError(
      "RECOVERY_CODE_SENT",
      "该手机号已有注册记录，已发送 Zovii 登录验证码，请输入后重新提交"
    );
  }

  let session;
  try {
    session = await client.phoneLogin({ phone, code });
  } catch (error) {
    if (operation) {
      await db.externalOperation
        .update({
          where: { id: operation.id },
          data: { attempts: { increment: 1 } }
        })
        .catch(() => undefined);
      const updated = await db.externalOperation
        .findUnique({ where: { id: operation.id } })
        .catch(() => null);
      if (updated && updated.attempts >= 10) {
        throw new RegistrationError("RATE_LIMITED", "验证码尝试次数过多，请稍后再试");
      }
    }
    throw mapZoviiRegistrationError(error);
  }
  if (record?.externalUserId && session.user.id !== record.externalUserId) {
    throw new RegistrationError("ZOVII_ERROR", "Zovii 账号与注册记录不一致，请联系管理员处理");
  }

  const existingByIdentity = await db.externalIdentity.findUnique({
    where: { provider_externalUserId: { provider: "ZOVII", externalUserId: session.user.id } }
  });
  if (existingByIdentity) {
    const owner = await db.user.findUnique({
      where: { id: existingByIdentity.userId },
      select: { id: true, name: true, email: true, phone: true, role: true, institutionId: true }
    });
    if (owner) {
      if (owner.email !== email) {
        throw new RegistrationError("PHONE_TAKEN", "该手机号已注册 Chaoxing 账号，请直接登录");
      }
      return {
        user: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone ?? phone,
          role: owner.role as "STUDENT",
          institutionId: owner.institutionId
        },
        recovered: true
      };
    }
  }

  const existingByPhone = await db.user.findUnique({ where: { phone } });
  if (existingByPhone) {
    if (existingByPhone.email !== email) {
      throw new RegistrationError("PHONE_TAKEN", "该手机号已注册 Chaoxing 账号，请直接登录");
    }
    return {
      user: {
        id: existingByPhone.id,
        name: existingByPhone.name,
        email: existingByPhone.email,
        phone: existingByPhone.phone ?? phone,
        role: existingByPhone.role as "STUDENT",
        institutionId: existingByPhone.institutionId
      },
      recovered: true
    };
  }

  const existingByEmail = await db.user.findUnique({ where: { email } });
  if (existingByEmail) {
    throw new RegistrationError("EMAIL_TAKEN", "该邮箱已被使用，请更换邮箱或直接登录");
  }

  const institutionId = await resolveInstitutionId();
  const passwordHash = await hashPassword(password);
  let user: RegisteredUser;
  try {
    user = await persistLocalAccount({
      name,
      email,
      phone,
      passwordHash,
      role: "STUDENT",
      institutionId,
      externalUserId: session.user.id,
      encryptedCredential: encryptSecret(session.tokens.refreshToken)
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const byEmail = await db.user.findUnique({ where: { email } });
      if (byEmail) {
        throw new RegistrationError("EMAIL_TAKEN", "该邮箱已被使用，请更换邮箱或直接登录");
      }
      const byPhone = await db.user.findUnique({ where: { phone } });
      if (byPhone) {
        throw new RegistrationError("PHONE_TAKEN", "该手机号已注册 Chaoxing 账号，请直接登录");
      }
    }
    throw error;
  }
  if (operation) {
    await completeOperation(operation.id, {
      status: OP_STATUS.SUCCEEDED,
      result: { externalUserId: session.user.id, phone, name, email }
    });
  }
  return { user, recovered: true };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function mapZoviiRegistrationError(error: unknown): RegistrationError {
  if (error instanceof RegistrationError) return error;
  if (error instanceof ZoviiError && error.code === "PHONE_ALREADY_REGISTERED") {
    return new RegistrationError("PHONE_EXISTS_ON_ZOVII", toUserMessage("PHONE_ALREADY_REGISTERED"));
  }
  const failure = classifyAuthZoviiError(error);
  const code =
    failure.kind === "CODE_EXPIRED" || failure.kind === "CODE_USED" ? "INVALID_CODE" : failure.kind;
  return new RegistrationError(code, failure.message);
}
