import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { ZoviiClient } from "./client";
import { encryptSecret } from "./crypto";
import { classifyAuthZoviiError, ZoviiError } from "./errors";
import { sendPlatformCode } from "./sendCode";
import { maskPhone } from "./display";

export type LinkErrorCode =
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "CODE_USED"
  | "PHONE_NOT_REGISTERED"
  | "RATE_LIMITED"
  | "ACCOUNT_CONFLICT"
  | "PHONE_MISMATCH"
  | "PASSWORD_INVALID"
  | "NOT_LINKED"
  | "ZOVII_ERROR";

export class ZoviiLinkError extends Error {
  constructor(
    readonly code: LinkErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ZoviiLinkError";
  }
}

export async function sendLinkCode(phone: string, client: ZoviiClient = new ZoviiClient()): Promise<{ retryAfterSeconds: number }> {
  return sendPlatformCode(phone, "login", "link", client, (message) => {
    throw new ZoviiLinkError("RATE_LIMITED", message);
  });
}

export type ZoviiLinkStatus = {
  linked: boolean;
  phone?: string;
  maskedPhone?: string;
  externalUserId?: string;
  linkedAt?: string;
};

export async function getZoviiLinkStatus(userId: string): Promise<ZoviiLinkStatus> {
  const identity = await db.externalIdentity.findFirst({
    where: { userId, provider: "ZOVII" },
    orderBy: { createdAt: "desc" }
  });
  if (!identity) return { linked: false };
  return {
    linked: true,
    phone: identity.phone ?? undefined,
    maskedPhone: identity.phone ? maskPhone(identity.phone) : undefined,
    externalUserId: identity.externalUserId,
    linkedAt: identity.createdAt.toISOString()
  };
}

/**
 * Links the logged-in Chaoxing user to an existing Zovii account.
 * Control of the Zovii account is proven by a Zovii phone-login code
 * (purpose=login); Chaoxing never sees or stores the Zovii password.
 * A Zovii user id can only ever belong to one Chaoxing user.
 */
export async function linkZoviiAccount(
  input: { userId: string; phone: string; code: string },
  client: ZoviiClient = new ZoviiClient()
): Promise<{ linked: boolean; externalUserId: string; maskedPhone: string }> {
  let session;
  try {
    session = await client.phoneLogin({ phone: input.phone, code: input.code });
  } catch (error) {
    throw mapLinkError(error);
  }

  const externalUserId = session.user.id;
  if (session.user.phone && session.user.phone !== input.phone) {
    throw new ZoviiLinkError("PHONE_MISMATCH", "Zovii 返回的手机号与输入不一致，请重新验证");
  }

  const existingByIdentity = await db.externalIdentity.findUnique({
    where: { provider_externalUserId: { provider: "ZOVII", externalUserId } }
  });
  if (existingByIdentity) {
    if (existingByIdentity.userId === input.userId) {
      return {
        linked: true,
        externalUserId,
        maskedPhone: maskPhone(input.phone)
      };
    }
    throw new ZoviiLinkError("ACCOUNT_CONFLICT", "该 Zovii 账号已关联其他平台账号，无法重复关联");
  }

  const existingByPhone = await db.externalIdentity.findUnique({
    where: { provider_phone: { provider: "ZOVII", phone: input.phone } }
  });
  if (existingByPhone && existingByPhone.userId !== input.userId) {
    throw new ZoviiLinkError("ACCOUNT_CONFLICT", "该手机号已关联其他平台账号，无法重复关联");
  }

  const encryptedCredential = encryptSecret(session.tokens.refreshToken);
  const existingForUser = await db.externalIdentity.findFirst({
    where: { userId: input.userId, provider: "ZOVII" }
  });

  await db.$transaction(async (tx) => {
    if (existingForUser) {
      await tx.externalIdentity.update({
        where: { id: existingForUser.id },
        data: {
          externalUserId,
          phone: input.phone,
          status: "LINKED",
          encryptedCredential,
          credentialUpdatedAt: new Date()
        }
      });
    } else {
      await tx.externalIdentity.create({
        data: {
          userId: input.userId,
          provider: "ZOVII",
          externalUserId,
          phone: input.phone,
          status: "LINKED",
          encryptedCredential,
          credentialUpdatedAt: new Date()
        }
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.userId,
        action: "zovii_link",
        entity: "ExternalIdentity",
        entityId: externalUserId,
        metadata: JSON.stringify({ phone: maskPhone(input.phone), provider: "ZOVII" })
      }
    });
  });

  return {
    linked: true,
    externalUserId,
    maskedPhone: maskPhone(input.phone)
  };
}

/**
 * Unlinks Zovii from the Chaoxing account. Requires the Chaoxing password
 * (re-authentication) and never deletes or modifies the Zovii account itself.
 */
export async function unlinkZoviiAccount(input: { userId: string; password: string }): Promise<{ unlinked: boolean }> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true }
  });
  const passwordValid = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !passwordValid) {
    throw new ZoviiLinkError("PASSWORD_INVALID", "当前密码错误");
  }

  const identity = await db.externalIdentity.findFirst({
    where: { userId: input.userId, provider: "ZOVII" }
  });
  if (!identity) {
    throw new ZoviiLinkError("NOT_LINKED", "尚未关联 Zovii 账号");
  }

  await db.$transaction(async (tx) => {
    await tx.externalIdentity.delete({ where: { id: identity.id } });
    await tx.auditLog.create({
      data: {
        actorId: input.userId,
        action: "zovii_unlink",
        entity: "ExternalIdentity",
        entityId: identity.externalUserId,
        metadata: JSON.stringify({ provider: "ZOVII" })
      }
    });
  });

  return { unlinked: true };
}

function mapLinkError(error: unknown): ZoviiLinkError {
  if (error instanceof ZoviiLinkError) return error;
  const failure = classifyAuthZoviiError(error);
  return new ZoviiLinkError(failure.kind, failure.message);
}
