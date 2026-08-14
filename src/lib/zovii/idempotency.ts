import { db } from "@/lib/db";

export const OP_KINDS = {
  REGISTER_LINK: "REGISTER_LINK",
  ENTERPRISE_INVITE: "ENTERPRISE_INVITE",
  ENTERPRISE_ROLE: "ENTERPRISE_ROLE",
  ENTERPRISE_CREDITS: "ENTERPRISE_CREDITS"
} as const;

export type OperationKind = (typeof OP_KINDS)[keyof typeof OP_KINDS];

export const OP_STATUS = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED"
} as const;

export type OperationStatus = (typeof OP_STATUS)[keyof typeof OP_STATUS];

export type ClaimedOperation = {
  id: string;
  kind: OperationKind;
  idempotencyKey: string;
  status: OperationStatus;
  externalRequestId: string | null;
  result: string | null;
  errorCode: string | null;
  attempts: number;
};

export type ClaimResult =
  | { state: "created"; operation: ClaimedOperation }
  | { state: "replayed"; operation: ClaimedOperation }
  | { state: "in_flight"; operation: ClaimedOperation }
  | { state: "exhausted"; operation: ClaimedOperation };

export const MAX_OPERATION_ATTEMPTS = 10;
const EXHAUSTED_LOCKOUT_MS = 15 * 60 * 1000;

const SENSITIVE_FRAGMENT = /(code|token|password|secret|cookie)\s*[:=]\s*\S+/gi;

export function redactErrorMessage(message: string): string {
  return message.replace(SENSITIVE_FRAGMENT, "$1=[REDACTED]").slice(0, 500);
}

function toClaimed(record: {
  id: string;
  kind: string;
  idempotencyKey: string;
  status: string;
  externalRequestId: string | null;
  result: string | null;
  errorCode: string | null;
  attempts: number;
}): ClaimedOperation {
  return {
    id: record.id,
    kind: record.kind as OperationKind,
    idempotencyKey: record.idempotencyKey,
    status: record.status as OperationStatus,
    externalRequestId: record.externalRequestId,
    result: record.result,
    errorCode: record.errorCode,
    attempts: record.attempts
  };
}

/**
 * Claims an external write by idempotency key. Returns:
 * - "created" when this caller may proceed;
 * - "replayed" when a previous attempt already succeeded (caller should recover, not re-execute);
 * - "in_flight" when another attempt is pending (caller should wait/stop, not duplicate).
 * Failed operations are reclaimable so transient third-party errors can be retried.
 */
export async function claimOperation(input: {
  kind: OperationKind;
  idempotencyKey: string;
  userId?: string;
  institutionId?: string;
  pendingTtlMs?: number;
  maxAttempts?: number;
  lockoutMs?: number;
}): Promise<ClaimResult> {
  const pendingTtlMs = input.pendingTtlMs ?? 5 * 60 * 1000;
  const maxAttempts = input.maxAttempts ?? MAX_OPERATION_ATTEMPTS;
  const lockoutMs = input.lockoutMs ?? EXHAUSTED_LOCKOUT_MS;
  const existing = await db.externalOperation.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existing) {
    if (existing.kind !== input.kind) {
      throw new Error(`idempotency key ${input.idempotencyKey} was already used for a different operation kind`);
    }
    if (existing.status === OP_STATUS.SUCCEEDED) {
      return { state: "replayed", operation: toClaimed(existing) };
    }
    const stalePending =
      existing.status === OP_STATUS.PENDING &&
      existing.createdAt.getTime() < Date.now() - pendingTtlMs;
    if (existing.status === OP_STATUS.PENDING && !stalePending) {
      return { state: "in_flight", operation: toClaimed(existing) };
    }
    if (existing.attempts >= maxAttempts) {
      if (existing.updatedAt.getTime() > Date.now() - lockoutMs) {
        return { state: "exhausted", operation: toClaimed(existing) };
      }
      const reset = await db.externalOperation.update({
        where: { id: existing.id },
        data: {
          attempts: 0,
          lastError: null,
          ...(existing.status === OP_STATUS.FAILED ? { status: OP_STATUS.PENDING } : {})
        }
      });
      return { state: "created", operation: toClaimed(reset) };
    }
    const retried = await db.externalOperation.update({
      where: { id: existing.id },
      data: {
        ...(existing.status === OP_STATUS.FAILED ? { status: OP_STATUS.PENDING } : {}),
        lastError: null,
        attempts: { increment: 1 }
      }
    });
    return { state: "created", operation: toClaimed(retried) };
  }

  try {
    const created = await db.externalOperation.create({
      data: {
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId ?? null,
        institutionId: input.institutionId ?? null,
        status: OP_STATUS.PENDING
      }
    });
    return { state: "created", operation: toClaimed(created) };
  } catch (error) {
    // Concurrent first-time claims race on the unique idempotencyKey; the
    // loser sees the winner's row and reports it instead of failing with a
    // unique-constraint error.
    if (isUniqueConstraintError(error)) {
      const existing = await db.externalOperation.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (existing) {
        if (existing.kind !== input.kind) {
          throw new Error(`idempotency key ${input.idempotencyKey} was already used for a different operation kind`);
        }
        if (existing.status === OP_STATUS.SUCCEEDED) {
          return { state: "replayed", operation: toClaimed(existing) };
        }
        return { state: "in_flight", operation: toClaimed(existing) };
      }
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function completeOperation(
  operationId: string,
  input: {
    status: Extract<OperationStatus, "SUCCEEDED" | "FAILED">;
    externalRequestId?: string;
    result?: unknown;
    errorCode?: string;
    errorMessage?: string;
  }
): Promise<void> {
  await db.externalOperation.update({
    where: { id: operationId },
    data: {
      status: input.status,
      externalRequestId: input.externalRequestId ?? null,
      result: input.result !== undefined ? JSON.stringify(input.result) : undefined,
      errorCode: input.errorCode ?? null,
      lastError: input.errorMessage ? redactErrorMessage(input.errorMessage) : undefined
    }
  });
}
