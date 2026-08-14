import { db } from "@/lib/db";
import { ZoviiClient } from "./client";
import { ZoviiTokenStore } from "./tokenStore";
import { decryptSecret, encryptSecret } from "./crypto";
import { ZoviiError, toUserMessage } from "./errors";
import { claimOperation, completeOperation, OP_KINDS, OP_STATUS } from "./idempotency";
import type { SessionUser } from "@/lib/auth";
import type { ZoviiMember, ZoviiMemberList } from "./types";

export type EnterpriseErrorCode =
  | "NOT_AUTHORIZED"
  | "NOT_CONFIGURED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_LINKED"
  | "NOT_SAME_INSTITUTION"
  | "NOT_ENTERPRISE_MEMBER"
  | "INVALID_INPUT"
  | "INSUFFICIENT_BALANCE"
  | "CONFIRM_REQUIRED"
  | "OPERATION_IN_FLIGHT"
  | "RATE_LIMITED"
  | "ZOVII_ERROR";

export class EnterpriseAccessError extends Error {
  constructor(
    readonly code: EnterpriseErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EnterpriseAccessError";
  }
}

export const ENTERPRISE_ROLES = ["member", "enterprise_admin"] as const;
export type EnterpriseRole = (typeof ENTERPRISE_ROLES)[number];

export type MemberListItem = {
  chaoxingUserId: string;
  name: string;
  email: string;
  phone: string | null;
  linked: boolean;
  externalUserId: string | null;
  enterpriseMember: {
    id: string;
    username: string | null;
    displayId: string | null;
    role: string | null;
    enterpriseBalance: number | null;
    consumption: number | null;
    callCount: number | null;
    joinedAt: string | null;
  } | null;
};

export type MemberListPage = {
  items: MemberListItem[];
  total: number;
  page: number;
  limit: number;
};

export type EnterpriseOperationRecord = {
  id: string;
  kind: string;
  status: string;
  result: unknown;
  errorCode: string | null;
  externalRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnterpriseOverview = {
  configured: boolean;
  enterpriseId: string | null;
  poolBalance: number | null;
  memberCount: number | null;
};

export type IntegrationAdminRecord = {
  id: string;
  userId: string;
  name: string;
  email: string;
  grantedAt: string;
};

export async function getInstitutionIntegration(institutionId: string) {
  return db.institutionIntegration.findUnique({
    where: { institutionId_provider: { institutionId, provider: "ZOVII" } }
  });
}

export async function requireIntegrationAdmin(user: SessionUser): Promise<void> {
  const [grant, integration] = await Promise.all([
    db.institutionIntegrationAdmin.findUnique({
      where: { institutionId_userId: { institutionId: user.institutionId, userId: user.id } }
    }),
    getInstitutionIntegration(user.institutionId)
  ]);
  if (!grant) {
    throw new EnterpriseAccessError("NOT_AUTHORIZED", "无权管理学校企业设置");
  }
  if (!integration || !integration.enabled) {
    throw new EnterpriseAccessError("NOT_CONFIGURED", "学校尚未配置 Zovii 企业");
  }
}

export async function setInstitutionIntegration(input: {
  institutionId: string;
  enterpriseId: string;
  configuredById: string;
}): Promise<{ enterpriseId: string }> {
  const existing = await getInstitutionIntegration(input.institutionId);
  if (existing) {
    await db.institutionIntegration.update({
      where: { id: existing.id },
      data: {
        enterpriseId: input.enterpriseId,
        enabled: true,
        configuredById: input.configuredById,
        configuredAt: new Date()
      }
    });
  } else {
    await db.institutionIntegration.create({
      data: {
        institutionId: input.institutionId,
        provider: "ZOVII",
        enterpriseId: input.enterpriseId,
        enabled: true,
        configuredById: input.configuredById
      }
    });
  }
  await db.auditLog.create({
    data: {
      actorId: input.configuredById,
      action: "institution_integration_configure",
      entity: "InstitutionIntegration",
      entityId: input.institutionId,
      metadata: JSON.stringify({ provider: "ZOVII", enterpriseId: input.enterpriseId })
    }
  });
  return { enterpriseId: input.enterpriseId };
}

export async function grantIntegrationAdmin(input: {
  institutionId: string;
  targetUserId: string;
  grantedById: string;
}): Promise<void> {
  const target = await db.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, institutionId: true }
  });
  if (!target || target.institutionId !== input.institutionId) {
    throw new EnterpriseAccessError("TARGET_NOT_FOUND", "目标用户不属于当前学校");
  }
  await db.institutionIntegrationAdmin.upsert({
    where: { institutionId_userId: { institutionId: input.institutionId, userId: input.targetUserId } },
    update: { grantedById: input.grantedById },
    create: {
      institutionId: input.institutionId,
      userId: input.targetUserId,
      grantedById: input.grantedById
    }
  });
  await db.auditLog.create({
    data: {
      actorId: input.grantedById,
      action: "institution_integration_admin_grant",
      entity: "InstitutionIntegrationAdmin",
      entityId: input.targetUserId,
      metadata: JSON.stringify({ institutionId: input.institutionId })
    }
  });
}

export async function revokeIntegrationAdmin(input: {
  institutionId: string;
  targetUserId: string;
  revokedById: string;
}): Promise<void> {
  const deleted = await db.institutionIntegrationAdmin.deleteMany({
    where: {
      institutionId: input.institutionId,
      userId: input.targetUserId
    }
  });
  if (deleted.count === 0) {
    throw new EnterpriseAccessError("TARGET_NOT_FOUND", "该用户不是集成管理员");
  }
  await db.auditLog.create({
    data: {
      actorId: input.revokedById,
      action: "institution_integration_admin_revoke",
      entity: "InstitutionIntegrationAdmin",
      entityId: input.targetUserId,
      metadata: JSON.stringify({ institutionId: input.institutionId })
    }
  });
}

export async function listIntegrationAdmins(institutionId: string): Promise<IntegrationAdminRecord[]> {
  const grants = await db.institutionIntegrationAdmin.findMany({
    where: { institutionId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" }
  });
  return grants.map((grant) => ({
    id: grant.id,
    userId: grant.user.id,
    name: grant.user.name,
    email: grant.user.email,
    grantedAt: grant.createdAt.toISOString()
  }));
}

async function buildAdminTokenStore(user: SessionUser, client: ZoviiClient): Promise<ZoviiTokenStore> {
  const identity = await db.externalIdentity.findFirst({
    where: { userId: user.id, provider: "ZOVII", status: "LINKED" }
  });
  if (!identity?.encryptedCredential) {
    throw new EnterpriseAccessError("TARGET_NOT_LINKED", "需要先在账号设置中关联 Zovii 账号");
  }
  const refreshToken = decryptSecret(identity.encryptedCredential);
  return new ZoviiTokenStore(refreshToken, client, Date.now, async (rotated) => {
    await db.externalIdentity.update({
      where: { id: identity.id },
      data: {
        encryptedCredential: encryptSecret(rotated),
        credentialUpdatedAt: new Date()
      }
    });
  });
}

export async function getEnterpriseOverview(user: SessionUser, client: ZoviiClient = new ZoviiClient()): Promise<EnterpriseOverview> {
  const grant = await db.institutionIntegrationAdmin.findUnique({
    where: { institutionId_userId: { institutionId: user.institutionId, userId: user.id } }
  });
  if (!grant) {
    throw new EnterpriseAccessError("NOT_AUTHORIZED", "无权查看学校企业概览");
  }
  const integration = await getInstitutionIntegration(user.institutionId);
  if (!integration || !integration.enabled) {
    return { configured: false, enterpriseId: null, poolBalance: null, memberCount: null };
  }
  try {
    const store = await buildAdminTokenStore(user, client);
    const [balance, members] = await Promise.all([
      client.getEnterpriseBalance(store),
      client.getEnterpriseMembers(store, { page: 1, limit: 1 })
    ]);
    return {
      configured: true,
      enterpriseId: integration.enterpriseId,
      poolBalance: resolvePoolBalance(balance),
      memberCount: members.total ?? null
    };
  } catch (error) {
    throw mapEnterpriseError(error);
  }
}

export async function listEnterpriseMembers(
  user: SessionUser,
  input: { page: number; limit: number; search?: string },
  client: ZoviiClient = new ZoviiClient()
): Promise<MemberListPage> {
  await requireIntegrationAdmin(user);
  const page = Math.max(1, input.page);
  const limit = Math.min(100, Math.max(1, input.limit));
  const search = input.search?.trim() ?? "";
  const userWhere = {
    institutionId: user.institutionId,
    role: "STUDENT",
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } }
          ]
        }
      : {})
  };

  const [users, zoviiList] = await Promise.all([
    db.user.findMany({
      where: userWhere,
      include: {
        externalIdentities: {
          where: { provider: "ZOVII" },
          select: { externalUserId: true, phone: true }
        }
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    fetchAllZoviiMembers(user, client)
  ]);

  const total = await db.user.count({
    where: userWhere
  });

  const membersByExternalId = new Map<string, ZoviiMember>();
  for (const member of zoviiList) {
    if (member.userId) membersByExternalId.set(member.userId, member);
  }

  const items: MemberListItem[] = users.map((userRecord) => {
    const identity = userRecord.externalIdentities[0];
    const externalUserId = identity?.externalUserId ?? null;
    const enterpriseMember = externalUserId ? membersByExternalId.get(externalUserId) ?? null : null;
    return {
      chaoxingUserId: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      phone: userRecord.phone ?? null,
      linked: Boolean(identity),
      externalUserId,
      enterpriseMember: enterpriseMember
        ? {
            id: enterpriseMember.id,
            username: enterpriseMember.username ?? null,
            displayId: enterpriseMember.displayId ?? null,
            role: enterpriseMember.role ?? null,
            enterpriseBalance: enterpriseMember.enterpriseBalance ?? null,
            consumption: enterpriseMember.consumption ?? null,
            callCount: enterpriseMember.callCount ?? null,
            joinedAt: enterpriseMember.joinedAt ?? null
          }
        : null
    };
  });

  return { items, total, page, limit };
}

/**
 * Fetches the enterprise member roster in bounded pages so the school member
 * view can join Chaoxing students with Zovii membership without depending on
 * matching pagination or search semantics. Pages are fetched until the roster
 * is covered or a hard safety cap is reached (v1: 10,000 members).
 */
const MAX_MEMBER_SCAN_PAGES = 50;
const MEMBER_PAGE_SIZE = 200;

async function fetchAllZoviiMembers(user: SessionUser, client: ZoviiClient): Promise<ZoviiMember[]> {
  try {
    const store = await buildAdminTokenStore(user, client);
    const members: ZoviiMember[] = [];
    for (let page = 1; page <= MAX_MEMBER_SCAN_PAGES; page += 1) {
      const list = await client.getEnterpriseMembers(store, { page, limit: MEMBER_PAGE_SIZE });
      members.push(...list.members);
      if (list.members.length < MEMBER_PAGE_SIZE || members.length >= (list.total ?? members.length)) {
        break;
      }
    }
    return members;
  } catch (error) {
    throw mapEnterpriseError(error);
  }
}

async function findEnterpriseMember(
  user: SessionUser,
  memberId: string,
  client: ZoviiClient
): Promise<ZoviiMember> {
  try {
    const store = await buildAdminTokenStore(user, client);
    const searched = await client.getEnterpriseMembers(store, {
      search: memberId,
      limit: MEMBER_PAGE_SIZE
    });
    let matchedMember = searched.members.find((member) => member.userId === memberId) ?? null;
    if (!matchedMember) {
      const members = await fetchAllZoviiMembers(user, client);
      matchedMember = members.find((member) => member.userId === memberId) ?? null;
    }
    if (!matchedMember) {
      throw new EnterpriseAccessError("NOT_ENTERPRISE_MEMBER", "目标成员不在企业成员列表中");
    }
    return matchedMember;
  } catch (error) {
    if (error instanceof EnterpriseAccessError) throw error;
    throw mapEnterpriseError(error);
  }
}

async function findTargetStudent(user: SessionUser, targetUserId: string) {
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    include: {
      externalIdentities: {
        where: { provider: "ZOVII" },
        select: { externalUserId: true, phone: true }
      }
    }
  });
  if (!target || target.institutionId !== user.institutionId) {
    throw new EnterpriseAccessError("NOT_SAME_INSTITUTION", "目标用户不属于当前学校");
  }
  if (target.role !== "STUDENT") {
    throw new EnterpriseAccessError("NOT_SAME_INSTITUTION", "只能邀请学生加入企业");
  }
  return target;
}

export async function inviteEnterpriseMember(
  user: SessionUser,
  input: { targetUserId: string; role: EnterpriseRole; operationId: string },
  client: ZoviiClient = new ZoviiClient()
): Promise<{ inviteUrl: string | null; replayed: boolean }> {
  await requireIntegrationAdmin(user);
  const target = await findTargetStudent(user, input.targetUserId);
  const identity = target.externalIdentities[0];
  if (!identity) {
    throw new EnterpriseAccessError("TARGET_NOT_LINKED", "该学生尚未关联 Zovii 账号，请先完成关联");
  }
  if (!ENTERPRISE_ROLES.includes(input.role)) {
    throw new EnterpriseAccessError("INVALID_INPUT", "不支持的企业角色");
  }

  const claim = await claimEnterpriseOperation(
    OP_KINDS.ENTERPRISE_INVITE,
    input.operationId,
    user,
    "邀请请求正在处理中，请勿重复提交"
  );
  if (claim.state === "replayed") {
    return { inviteUrl: claim.operation.result ? extractInviteUrl(claim.operation.result) : null, replayed: true };
  }

  try {
    const store = await buildAdminTokenStore(user, client);
    const result = await client.inviteMember(store, {
      type: "link",
      role: input.role
    });
    const inviteUrl = result.token ? `${client.baseUrl}/enterprise/invite/${result.token}` : null;
    await completeOperation(claim.operation.id, {
      status: OP_STATUS.SUCCEEDED,
      externalRequestId: result.requestId,
      result: {
        targetUserId: input.targetUserId,
        externalUserId: identity.externalUserId,
        role: input.role,
        inviteToken: result.token ?? null,
        inviteUrl: inviteUrl ?? null
      }
    });
    return { inviteUrl, replayed: false };
  } catch (error) {
    const mapped = mapEnterpriseError(error);
    await recordOperationFailure(claim.operation.id, mapped);
    throw mapped;
  }
}

function extractInviteUrl(resultJson: string): string | null {
  try {
    const parsed = JSON.parse(resultJson) as { inviteUrl?: string | null };
    return parsed.inviteUrl ?? null;
  } catch {
    return null;
  }
}

export async function setEnterpriseMemberRole(
  user: SessionUser,
  input: { memberId: string; role: EnterpriseRole; confirm: boolean; operationId: string },
  client: ZoviiClient = new ZoviiClient()
): Promise<{ replayed: boolean }> {
  await requireIntegrationAdmin(user);
  if (!ENTERPRISE_ROLES.includes(input.role)) {
    throw new EnterpriseAccessError("INVALID_INPUT", "不支持的企业角色");
  }
  if (!input.confirm) {
    throw new EnterpriseAccessError("CONFIRM_REQUIRED", "调整企业角色需要二次确认");
  }

  await requireTargetEnterpriseMember(user, input.memberId, client);

  const claim = await claimEnterpriseOperation(
    OP_KINDS.ENTERPRISE_ROLE,
    input.operationId,
    user,
    "角色修改正在处理中，请勿重复提交"
  );
  if (claim.state === "replayed") {
    return { replayed: true };
  }

  try {
    const store = await buildAdminTokenStore(user, client);
    const result = await client.setMemberRole(store, input.memberId, input.role);
    await completeOperation(claim.operation.id, {
      status: OP_STATUS.SUCCEEDED,
      externalRequestId: result.requestId,
      result: { memberId: input.memberId, role: input.role }
    });
    return { replayed: false };
  } catch (error) {
    const mapped = mapEnterpriseError(error);
    await recordOperationFailure(claim.operation.id, mapped);
    throw mapped;
  }
}

export const CREDIT_ACTIONS = ["allocate", "adjust"] as const;
export type CreditAction = (typeof CREDIT_ACTIONS)[number];
export const MAX_CREDIT_AMOUNT = 1_000_000;

export type CreditAdjustmentResult = {
  replayed: boolean;
};

/**
 * Adjusts a member's enterprise credits through the real Zovii API.
 * Semantics are incremental (allocate=add, adjust=subtract) per the
 * revalidated contract. Every write is idempotent via the operation ledger
 * and recorded with sanitized results; deducting requires explicit confirm.
 */
export async function adjustMemberCredits(
  user: SessionUser,
  input: {
    memberId: string;
    action: CreditAction;
    amount: number;
    description?: string;
    confirm: boolean;
    operationId: string;
  },
  client: ZoviiClient = new ZoviiClient()
): Promise<CreditAdjustmentResult> {
  await requireIntegrationAdmin(user);

  if (!CREDIT_ACTIONS.includes(input.action)) {
    throw new EnterpriseAccessError("INVALID_INPUT", "不支持的积分操作类型");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > MAX_CREDIT_AMOUNT) {
    throw new EnterpriseAccessError("INVALID_INPUT", "积分数量必须是大于 0 的数字");
  }
  if (input.description && input.description.length > 200) {
    throw new EnterpriseAccessError("INVALID_INPUT", "备注最长 200 个字符");
  }
  if (input.action === "adjust" && !input.confirm) {
    throw new EnterpriseAccessError("CONFIRM_REQUIRED", "扣减积分需要二次确认");
  }

  const targetMember = await requireTargetEnterpriseMember(user, input.memberId, client);
  const balanceBefore = targetMember.enterpriseBalance ?? null;

  const claim = await claimEnterpriseOperation(
    OP_KINDS.ENTERPRISE_CREDITS,
    input.operationId,
    user,
    "积分操作正在处理中，请勿重复提交"
  );
  if (claim.state === "replayed") {
    return { replayed: true };
  }

  if (claim.operation.attempts > 0 && claim.operation.result) {
    try {
      const previous = JSON.parse(claim.operation.result) as { balanceBefore?: number | null };
      if (previous.balanceBefore !== undefined && previous.balanceBefore !== null) {
        const reconciled = await findEnterpriseMember(user, input.memberId, client);
        const current = reconciled.enterpriseBalance ?? null;
        if (current !== null && current !== previous.balanceBefore) {
          await completeOperation(claim.operation.id, {
            status: OP_STATUS.SUCCEEDED,
            result: { ...previous, reconciled: true }
          });
          return { replayed: true };
        }
      }
    } catch {
      // corrupt previous result: fall through to a fresh attempt
    }
  }

  try {
    const store = await buildAdminTokenStore(user, client);
    if (input.action === "adjust" && targetMember.enterpriseBalance !== null && targetMember.enterpriseBalance !== undefined) {
      if (targetMember.enterpriseBalance < input.amount) {
        await completeOperation(claim.operation.id, {
          status: OP_STATUS.FAILED,
          errorCode: "INSUFFICIENT_BALANCE",
          errorMessage: "成员积分余额不足"
        });
        throw new EnterpriseAccessError("INSUFFICIENT_BALANCE", "成员积分余额不足，无法扣减");
      }
    }
    if (input.action === "allocate") {
      const balance = await client.getEnterpriseBalance(store);
      const poolBalance = resolvePoolBalance(balance);
      if (poolBalance !== null && poolBalance < input.amount) {
        await completeOperation(claim.operation.id, {
          status: OP_STATUS.FAILED,
          errorCode: "INSUFFICIENT_BALANCE",
          errorMessage: "企业积分池余额不足"
        });
        throw new EnterpriseAccessError("INSUFFICIENT_BALANCE", "企业积分池余额不足，无法分配");
      }
    }

    const result = await client.setMemberCredits(store, input.memberId, {
      action: input.action,
      amount: input.amount,
      ...(input.description ? { description: input.description } : {})
    });
    await completeOperation(claim.operation.id, {
      status: OP_STATUS.SUCCEEDED,
      externalRequestId: result.requestId,
      result: {
        memberId: input.memberId,
        action: input.action,
        amount: input.amount,
        description: input.description ?? null,
        balanceBefore
      }
    });
    return { replayed: false };
  } catch (error) {
    const mapped = mapEnterpriseError(error);
    if (error instanceof EnterpriseAccessError && error.code === "INSUFFICIENT_BALANCE") {
      throw error;
    }
    await completeOperation(claim.operation.id, {
      status: OP_STATUS.FAILED,
      errorCode: mapped.code,
      errorMessage: mapped.message,
      result: {
        memberId: input.memberId,
        action: input.action,
        amount: input.amount,
        description: input.description ?? null,
        balanceBefore
      }
    }).catch(() => undefined);
    throw mapped;
  }
}

export function resolvePoolBalance(balance: { poolBalance?: number | null; available?: number | null; balance?: number | null }): number | null {
  return (balance.poolBalance ?? balance.available ?? balance.balance) ?? null;
}

export async function listEnterpriseOperations(
  user: SessionUser,
  input: { limit?: number }
): Promise<{ items: EnterpriseOperationRecord[] }> {
  await requireIntegrationAdmin(user);
  const limit = Math.min(50, Math.max(1, input.limit ?? 10));
  const operations = await db.externalOperation.findMany({
    where: {
      institutionId: user.institutionId,
      kind: {
        in: [OP_KINDS.ENTERPRISE_INVITE, OP_KINDS.ENTERPRISE_ROLE, OP_KINDS.ENTERPRISE_CREDITS]
      }
    },
    orderBy: { updatedAt: "desc" },
    take: limit
  });
  return {
    items: operations.map((operation) => {
      let result: unknown = null;
      if (operation.result) {
        try {
          result = JSON.parse(operation.result) as unknown;
        } catch {
          result = null;
        }
      }
      return {
        id: operation.id,
        kind: operation.kind,
        status: operation.status,
        result,
        errorCode: operation.errorCode,
        externalRequestId: operation.externalRequestId,
        createdAt: operation.createdAt.toISOString(),
        updatedAt: operation.updatedAt.toISOString()
      };
    })
  };
}

async function claimEnterpriseOperation(
  kind: (typeof OP_KINDS)[keyof typeof OP_KINDS],
  idempotencyKey: string,
  user: SessionUser,
  inFlightMessage: string
) {
  const claim = await claimOperation({
    kind,
    idempotencyKey,
    userId: user.id,
    institutionId: user.institutionId
  });
  if (claim.state === "in_flight") {
    throw new EnterpriseAccessError("OPERATION_IN_FLIGHT", inFlightMessage);
  }
  if (claim.state === "exhausted") {
    throw new EnterpriseAccessError("RATE_LIMITED", "操作尝试次数过多，请稍后再试");
  }
  return claim;
}

async function recordOperationFailure(
  operationId: string,
  mapped: EnterpriseAccessError
): Promise<void> {
  await completeOperation(operationId, {
    status: OP_STATUS.FAILED,
    errorCode: mapped.code,
    errorMessage: mapped.message
  }).catch(() => undefined);
}

/**
 * Scopes an enterprise member operation to the acting school: the Zovii member
 * id must belong to a Chaoxing user of this institution whose Zovii identity is
 * linked, and the member must appear in the enterprise member list.
 */
async function requireTargetEnterpriseMember(
  user: SessionUser,
  memberId: string,
  client: ZoviiClient
): Promise<ZoviiMember> {
  const identity = await db.externalIdentity.findFirst({
    where: { provider: "ZOVII", externalUserId: memberId, status: "LINKED" }
  });
  if (!identity) {
    throw new EnterpriseAccessError("NOT_ENTERPRISE_MEMBER", "目标成员不属于当前学校或尚未关联 Zovii");
  }
  const targetUser = await db.user.findUnique({
    where: { id: identity.userId },
    select: { institutionId: true }
  });
  if (!targetUser || targetUser.institutionId !== user.institutionId) {
    throw new EnterpriseAccessError("NOT_ENTERPRISE_MEMBER", "目标成员不属于当前学校");
  }

  return findEnterpriseMember(user, memberId, client);
}

export function mapEnterpriseError(error: unknown): EnterpriseAccessError {
  if (error instanceof EnterpriseAccessError) return error;
  if (error instanceof ZoviiError) {
    switch (error.code) {
      case "ENTERPRISE_ACCESS_DENIED":
        return new EnterpriseAccessError("NOT_AUTHORIZED", toUserMessage("ENTERPRISE_ACCESS_DENIED"));
      case "UNAUTHORIZED":
        return new EnterpriseAccessError("NOT_AUTHORIZED", toUserMessage("UNAUTHORIZED"));
      case "RATE_LIMITED":
        return new EnterpriseAccessError("RATE_LIMITED", toUserMessage("RATE_LIMITED"));
      default:
        return new EnterpriseAccessError("ZOVII_ERROR", toUserMessage(error.code));
    }
  }
  return new EnterpriseAccessError("ZOVII_ERROR", "外部服务异常，请稍后重试");
}
