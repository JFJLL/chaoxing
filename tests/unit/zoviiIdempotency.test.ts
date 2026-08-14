import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalOperation: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create
    }
  }
}));

import {
  claimOperation,
  completeOperation,
  OP_KINDS,
  OP_STATUS,
  redactErrorMessage
} from "../../src/lib/zovii/idempotency";

const baseRecord = {
  id: "op-1",
  kind: OP_KINDS.ENTERPRISE_INVITE,
  idempotencyKey: "key-1",
  externalRequestId: null,
  result: null,
  errorCode: null,
  attempts: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("external operation ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
  });

  it("creates a PENDING operation on first claim", async () => {
    mocks.create.mockResolvedValue({ ...baseRecord, id: "op-new", status: OP_STATUS.PENDING, attempts: 0 });

    const result = await claimOperation({
      kind: OP_KINDS.ENTERPRISE_INVITE,
      idempotencyKey: "key-1",
      userId: "user-1",
      institutionId: "institution-1"
    });

    expect(result.state).toBe("created");
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        kind: OP_KINDS.ENTERPRISE_INVITE,
        idempotencyKey: "key-1",
        userId: "user-1",
        institutionId: "institution-1",
        status: OP_STATUS.PENDING
      }
    });
  });

  it("returns replayed when a previous attempt succeeded", async () => {
    mocks.findUnique.mockResolvedValue({ ...baseRecord, status: OP_STATUS.SUCCEEDED, result: "{\"memberId\":\"m-1\"}" });

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("replayed");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns in_flight while a previous attempt is pending", async () => {
    mocks.findUnique.mockResolvedValue({ ...baseRecord, status: OP_STATUS.PENDING });

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("in_flight");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reclaims a FAILED operation as a new attempt", async () => {
    mocks.findUnique.mockResolvedValue({ ...baseRecord, status: OP_STATUS.FAILED, attempts: 1 });
    mocks.update.mockResolvedValue({ ...baseRecord, status: OP_STATUS.PENDING, attempts: 2 });

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("created");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "op-1" },
      data: { status: OP_STATUS.PENDING, lastError: null, attempts: { increment: 1 } }
    });
  });

  it("reclaims a stale PENDING operation after the TTL", async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseRecord,
      status: OP_STATUS.PENDING,
      createdAt: new Date(Date.now() - 10 * 60 * 1000)
    });
    mocks.update.mockResolvedValue({
      ...baseRecord,
      status: OP_STATUS.PENDING,
      attempts: 2,
      createdAt: new Date(Date.now() - 10 * 60 * 1000)
    });

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("created");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "op-1" },
      data: { lastError: null, attempts: { increment: 1 } }
    });
  });

  it("resolves a concurrent create race to in_flight instead of crashing", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseRecord, status: OP_STATUS.PENDING });
    mocks.create.mockRejectedValue(Object.assign(new Error("unique constraint"), { code: "P2002" }));

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("in_flight");
  });

  it("resolves a concurrent create race to replayed when the winner succeeded", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...baseRecord,
        status: OP_STATUS.SUCCEEDED,
        result: "{\"memberId\":\"m-1\"}"
      });
    mocks.create.mockRejectedValue(Object.assign(new Error("unique constraint"), { code: "P2002" }));

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("replayed");
  });

  it("rejects an idempotency key reused across different operation kinds", async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseRecord,
      kind: OP_KINDS.ENTERPRISE_ROLE,
      status: OP_STATUS.SUCCEEDED
    });

    await expect(claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" })).rejects.toThrow(
      /different operation kind/
    );
  });

  it("returns exhausted while the attempt budget is spent and the lockout is fresh", async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseRecord,
      status: OP_STATUS.FAILED,
      attempts: 10,
      updatedAt: new Date()
    });

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("exhausted");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("resets the attempt budget after the lockout window expires", async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseRecord,
      status: OP_STATUS.FAILED,
      attempts: 10,
      updatedAt: new Date(Date.now() - 20 * 60 * 1000)
    });
    mocks.update.mockResolvedValue({
      ...baseRecord,
      status: OP_STATUS.PENDING,
      attempts: 0,
      updatedAt: new Date(Date.now() - 20 * 60 * 1000)
    });

    const result = await claimOperation({ kind: OP_KINDS.ENTERPRISE_INVITE, idempotencyKey: "key-1" });

    expect(result.state).toBe("created");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "op-1" },
      data: { attempts: 0, lastError: null, status: OP_STATUS.PENDING }
    });
  });

  it("completes an operation with sanitized result and redacted error", async () => {
    await completeOperation("op-1", {
      status: OP_STATUS.SUCCEEDED,
      externalRequestId: "req-9",
      result: { memberId: "m-1", phone: "138****0000" },
      errorMessage: "code=123456 token=abc failed"
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "op-1" },
      data: {
        status: OP_STATUS.SUCCEEDED,
        externalRequestId: "req-9",
        result: JSON.stringify({ memberId: "m-1", phone: "138****0000" }),
        errorCode: null,
        lastError: expect.stringContaining("[REDACTED]")
      }
    });
  });

  it("redacts sensitive fragments in error messages", () => {
    const redacted = redactErrorMessage("phone-login failed: code=111111 token=abc123");
    expect(redacted).not.toContain("111111");
    expect(redacted).not.toContain("abc123");
    expect(redacted).toContain("[REDACTED]");
  });
});
