import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const INITIAL_TEACHER_CREDITS = 10;

export type CreditLedgerType =
  | "INITIAL_GRANT"
  | "RECHARGE"
  | "RESERVE"
  | "CONSUME"
  | "RELEASE"
  | "ADMIN_ADJUSTMENT";

export class CreditError extends Error {
  constructor(public readonly code: "INSUFFICIENT_CREDITS" | "INVALID_CREDIT_AMOUNT", message: string) {
    super(message);
  }
}

type TransactionClient = Prisma.TransactionClient;

function assertPositiveInteger(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CreditError("INVALID_CREDIT_AMOUNT", "积分数量必须为正整数");
  }
}

async function findOrCreateAccount(tx: TransactionClient, userId: string) {
  const current = await tx.creditAccount.findUnique({ where: { userId } });
  if (current) return current;

  try {
    return await tx.creditAccount.create({ data: { userId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return tx.creditAccount.findUniqueOrThrow({ where: { userId } });
    }
    throw error;
  }
}

export async function grantInitialTeacherCreditsInTransaction(tx: TransactionClient, userId: string, role: string) {
  if (role !== "TEACHER") return null;

  const account = await findOrCreateAccount(tx, userId);
  const referenceId = `teacher-initial:${userId}`;
  const existing = await tx.creditLedger.findUnique({
    where: { referenceType_referenceId_type: { referenceType: "USER", referenceId, type: "INITIAL_GRANT" } }
  });
  if (existing) return account;

  await tx.creditAccount.update({
    where: { id: account.id },
    data: { available: { increment: INITIAL_TEACHER_CREDITS }, version: { increment: 1 } }
  });
  await tx.creditLedger.create({
    data: {
      accountId: account.id,
      type: "INITIAL_GRANT",
      availableDelta: INITIAL_TEACHER_CREDITS,
      referenceType: "USER",
      referenceId,
      description: "教师初始积分"
    }
  });
  return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
}

export async function grantInitialTeacherCredits(userId: string, role: string) {
  return db.$transaction((tx) => grantInitialTeacherCreditsInTransaction(tx, userId, role));
}

export async function getCreditAccount(userId: string) {
  return db.$transaction(async (tx) => findOrCreateAccount(tx, userId));
}

export async function getCreditAccountSummary(userId: string) {
  const account = await getCreditAccount(userId);
  const ledgers = await db.creditLedger.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return { account, ledgers };
}

export async function reserveCreditsInTransaction(tx: TransactionClient, input: {
  userId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  description: string;
  metadata?: unknown;
}) {
  assertPositiveInteger(input.amount);
  const account = await findOrCreateAccount(tx, input.userId);
  const existing = await tx.creditLedger.findUnique({
    where: {
      referenceType_referenceId_type: {
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        type: "RESERVE"
      }
    }
  });
  if (existing) return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });

  const updated = await tx.creditAccount.updateMany({
    where: { id: account.id, available: { gte: input.amount } },
    data: {
      available: { decrement: input.amount },
      reserved: { increment: input.amount },
      version: { increment: 1 }
    }
  });
  if (!updated.count) throw new CreditError("INSUFFICIENT_CREDITS", "积分不足，请充值后再生成课件");

  await tx.creditLedger.create({
    data: {
      accountId: account.id,
      type: "RESERVE",
      availableDelta: -input.amount,
      reservedDelta: input.amount,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata)
    }
  });
  return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
}

export async function reserveCredits(input: {
  userId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  description: string;
  metadata?: unknown;
}) {
  return db.$transaction((tx) => reserveCreditsInTransaction(tx, input));
}

async function settleReservedCredits(input: {
  userId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  type: "CONSUME" | "RELEASE";
  description: string;
  metadata?: unknown;
}) {
  assertPositiveInteger(input.amount);
  return db.$transaction(async (tx) => {
    const account = await findOrCreateAccount(tx, input.userId);
    const existing = await tx.creditLedger.findUnique({
      where: {
        referenceType_referenceId_type: {
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          type: input.type
        }
      }
    });
    if (existing) return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });

    const updated = await tx.creditAccount.updateMany({
      where: { id: account.id, reserved: { gte: input.amount } },
      data: input.type === "CONSUME"
        ? { reserved: { decrement: input.amount }, version: { increment: 1 } }
        : {
            available: { increment: input.amount },
            reserved: { decrement: input.amount },
            version: { increment: 1 }
          }
    });
    if (!updated.count) throw new CreditError("INVALID_CREDIT_AMOUNT", "冻结积分状态异常");

    await tx.creditLedger.create({
      data: {
        accountId: account.id,
        type: input.type,
        availableDelta: input.type === "RELEASE" ? input.amount : 0,
        reservedDelta: -input.amount,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
        metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata)
      }
    });
    return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
  });
}

export function consumeReservedCredits(input: Omit<Parameters<typeof settleReservedCredits>[0], "type">) {
  return settleReservedCredits({ ...input, type: "CONSUME" });
}

export function releaseReservedCredits(input: Omit<Parameters<typeof settleReservedCredits>[0], "type">) {
  return settleReservedCredits({ ...input, type: "RELEASE" });
}

export async function creditRechargeInTransaction(tx: TransactionClient, input: {
  userId: string;
  orderId: string;
  credits: number;
  description: string;
  metadata?: unknown;
}) {
  assertPositiveInteger(input.credits);
  const account = await findOrCreateAccount(tx, input.userId);
  const existing = await tx.creditLedger.findUnique({
    where: {
      referenceType_referenceId_type: {
        referenceType: "PAYMENT_ORDER",
        referenceId: input.orderId,
        type: "RECHARGE"
      }
    }
  });
  if (existing) return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });

  await tx.creditAccount.update({
    where: { id: account.id },
    data: { available: { increment: input.credits }, version: { increment: 1 } }
  });
  await tx.creditLedger.create({
    data: {
      accountId: account.id,
      type: "RECHARGE",
      availableDelta: input.credits,
      referenceType: "PAYMENT_ORDER",
      referenceId: input.orderId,
      description: input.description,
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata)
    }
  });
  return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
}

export async function creditRecharge(input: {
  userId: string;
  orderId: string;
  credits: number;
  description: string;
  metadata?: unknown;
}) {
  return db.$transaction((tx) => creditRechargeInTransaction(tx, input));
}

export async function adjustCreditsByAdministrator(input: {
  administratorId: string;
  userId: string;
  delta: number;
  referenceId: string;
  reason: string;
}) {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new CreditError("INVALID_CREDIT_AMOUNT", "调账积分必须为非零整数");
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 240) {
    throw new CreditError("INVALID_CREDIT_AMOUNT", "请填写不超过 240 字的调账原因");
  }
  return db.$transaction(async (tx) => {
    const account = await findOrCreateAccount(tx, input.userId);
    const existing = await tx.creditLedger.findUnique({
      where: { referenceType_referenceId_type: { referenceType: "ADMIN", referenceId: input.referenceId, type: "ADMIN_ADJUSTMENT" } }
    });
    if (existing) return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
    const updated = await tx.creditAccount.updateMany({
      where: input.delta < 0 ? { id: account.id, available: { gte: Math.abs(input.delta) } } : { id: account.id },
      data: { available: { increment: input.delta }, version: { increment: 1 } }
    });
    if (!updated.count) throw new CreditError("INSUFFICIENT_CREDITS", "可用积分不足，不能扣减冻结中的积分");
    await tx.creditLedger.create({
      data: {
        accountId: account.id,
        type: "ADMIN_ADJUSTMENT",
        availableDelta: input.delta,
        referenceType: "ADMIN",
        referenceId: input.referenceId,
        description: `管理员调账：${reason}`,
        metadata: JSON.stringify({ administratorId: input.administratorId, reason })
      }
    });
    return tx.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
  });
}

export async function backfillTeacherInitialCredits() {
  const teachers = await db.user.findMany({ where: { role: "TEACHER" }, select: { id: true, role: true } });
  for (const teacher of teachers) {
    await grantInitialTeacherCredits(teacher.id, teacher.role);
  }
  return teachers.length;
}
