import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoviiError } from "../../src/lib/zovii/errors";

const mocks = vi.hoisted(() => ({
  adminFindUnique: vi.fn(),
  integrationFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  identityFindFirst: vi.fn(),
  opFindUnique: vi.fn(),
  opCreate: vi.fn(),
  opUpdate: vi.fn(),
  decryptSecret: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    institutionIntegrationAdmin: {
      findUnique: mocks.adminFindUnique
    },
    institutionIntegration: {
      findUnique: mocks.integrationFindUnique
    },
    user: {
      findFirst: mocks.userFindFirst,
      findUnique: mocks.userFindUnique
    },
    externalIdentity: {
      findFirst: mocks.identityFindFirst
    },
    externalOperation: {
      findUnique: mocks.opFindUnique,
      create: mocks.opCreate,
      update: mocks.opUpdate
    }
  }
}));

vi.mock("../../src/lib/zovii/crypto", () => ({
  decryptSecret: mocks.decryptSecret
}));

import { adjustMemberCredits, MAX_CREDIT_AMOUNT } from "../../src/lib/zovii/enterprise";

const integrationAdminUser = {
  id: "teacher-1",
  name: "李素艳",
  role: "TEACHER",
  institutionId: "institution-1"
} as const;

function pendingOperation() {
  return {
    id: "op-1",
    kind: "ENTERPRISE_CREDITS",
    idempotencyKey: "key-1",
    status: "PENDING",
    externalRequestId: null,
    result: null,
    errorCode: null,
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe("adjustMemberCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });
    mocks.identityFindFirst.mockResolvedValue({
      id: "identity-1",
      externalUserId: "zovii-student-1",
      encryptedCredential: "enc-1",
      status: "LINKED"
    });
    mocks.userFindUnique.mockResolvedValue({ institutionId: "institution-1" });
    mocks.decryptSecret.mockReturnValue("refresh-1");
    mocks.opFindUnique.mockResolvedValue(null);
    mocks.opCreate.mockResolvedValue(pendingOperation());
    mocks.opUpdate.mockResolvedValue({ id: "op-1" });
  });

  it("rejects a teacher without an explicit grant", async () => {
    mocks.adminFindUnique.mockResolvedValue(null);
    const client = {} as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-student-1",
          action: "allocate",
          amount: 10,
          confirm: true,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
  });

  it("rejects invalid amounts", async () => {
    const client = { getEnterpriseBalance: vi.fn(), setMemberCredits: vi.fn() } as never;

    for (const amount of [0, -5, MAX_CREDIT_AMOUNT + 1]) {
      await expect(
        adjustMemberCredits(
          integrationAdminUser,
          {
            memberId: "zovii-student-1",
            action: "allocate",
            amount,
            confirm: true,
            operationId: "operation-00000001"
          },
          client
        )
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
  });

  it("rejects targets outside the institution or unlinked", async () => {
    mocks.identityFindFirst.mockResolvedValue(null);
    const client = { getEnterpriseBalance: vi.fn(), setMemberCredits: vi.fn() } as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-other",
          action: "allocate",
          amount: 10,
          confirm: true,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "NOT_ENTERPRISE_MEMBER" });
  });

  it("rejects members not present in the enterprise member list", async () => {
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({ members: [], total: 0 }),
      getEnterpriseBalance: vi.fn(),
      setMemberCredits: vi.fn()
    } as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-student-1",
          action: "allocate",
          amount: 10,
          confirm: true,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "NOT_ENTERPRISE_MEMBER" });
    expect((client as { setMemberCredits: ReturnType<typeof vi.fn> }).setMemberCredits).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation for deductions", async () => {
    const setMemberCredits = vi.fn();
    const client = { getEnterpriseBalance: vi.fn(), setMemberCredits } as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-student-1",
          action: "adjust",
          amount: 10,
          confirm: false,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" });
    expect(setMemberCredits).not.toHaveBeenCalled();
  });

  it("blocks allocation beyond the enterprise pool balance", async () => {
    const setMemberCredits = vi.fn();
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
        total: 1
      }),
      getEnterpriseBalance: vi.fn().mockResolvedValue({ poolBalance: 50 }),
      setMemberCredits
    } as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-student-1",
          action: "allocate",
          amount: 100,
          confirm: true,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(setMemberCredits).not.toHaveBeenCalled();
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", errorCode: "INSUFFICIENT_BALANCE" })
      })
    );
  });

  it("allocates credits through the real API with sanitized audit", async () => {
    const setMemberCredits = vi.fn().mockResolvedValue({});
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
        total: 1
      }),
      getEnterpriseBalance: vi.fn().mockResolvedValue({ poolBalance: 500 }),
      setMemberCredits
    } as never;

    const result = await adjustMemberCredits(
      integrationAdminUser,
      {
        memberId: "zovii-student-1",
        action: "allocate",
        amount: 120.5,
        description: "实践项目补贴",
        confirm: true,
        operationId: "operation-00000001"
      },
      client
    );

    expect(result.replayed).toBe(false);
    expect(setMemberCredits).toHaveBeenCalledWith(expect.anything(), "zovii-student-1", {
      action: "allocate",
      amount: 120.5,
      description: "实践项目补贴"
    });
    const updateArg = mocks.opUpdate.mock.calls[0][0] as { data: { result: string; status: string } };
    expect(updateArg.data.status).toBe("SUCCEEDED");
    const resultRecord = JSON.parse(updateArg.data.result) as Record<string, unknown>;
    expect(resultRecord).toMatchObject({
      memberId: "zovii-student-1",
      action: "allocate",
      amount: 120.5
    });
    expect(JSON.stringify(resultRecord)).not.toContain("refresh");
    expect(JSON.stringify(resultRecord)).not.toContain("token");
  });

  it("deducts credits only after confirmation", async () => {
    const setMemberCredits = vi.fn().mockResolvedValue({});
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
        total: 1
      }),
      getEnterpriseBalance: vi.fn(),
      setMemberCredits
    } as never;

    const result = await adjustMemberCredits(
      integrationAdminUser,
      {
        memberId: "zovii-student-1",
        action: "adjust",
        amount: 20,
        confirm: true,
        operationId: "operation-00000001"
      },
      client
    );

    expect(result.replayed).toBe(false);
    expect(setMemberCredits).toHaveBeenCalledWith(expect.anything(), "zovii-student-1", {
      action: "adjust",
      amount: 20
    });
  });

  it("blocks duplicate concurrent submissions", async () => {
    mocks.opFindUnique.mockResolvedValue(pendingOperation());
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
        total: 1
      }),
      getEnterpriseBalance: vi.fn(),
      setMemberCredits: vi.fn()
    } as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-student-1",
          action: "allocate",
          amount: 10,
          confirm: true,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "OPERATION_IN_FLIGHT" });
  });

  it("replays a succeeded operation without calling Zovii again", async () => {
    mocks.opFindUnique.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      result: JSON.stringify({ memberId: "zovii-student-1", action: "allocate", amount: 10 })
    });
    const setMemberCredits = vi.fn();
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
        total: 1
      }),
      getEnterpriseBalance: vi.fn(),
      setMemberCredits
    } as never;

    const result = await adjustMemberCredits(
      integrationAdminUser,
      {
        memberId: "zovii-student-1",
        action: "allocate",
        amount: 10,
        confirm: true,
        operationId: "operation-00000001"
      },
      client
    );

    expect(result.replayed).toBe(true);
    expect(setMemberCredits).not.toHaveBeenCalled();
    expect(mocks.opUpdate).not.toHaveBeenCalled();
  });

  it("marks the operation FAILED on Zovii timeout so a retry can reclaim", async () => {
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
        total: 1
      }),
      getEnterpriseBalance: vi.fn().mockResolvedValue({ poolBalance: 500 }),
      setMemberCredits: vi.fn().mockRejectedValue(
        new ZoviiError("TIMEOUT", "timed out", { status: 0, retryable: true })
      )
    } as never;

    await expect(
      adjustMemberCredits(
        integrationAdminUser,
        {
          memberId: "zovii-student-1",
          action: "allocate",
          amount: 10,
          confirm: true,
          operationId: "operation-00000001"
        },
        client
      )
    ).rejects.toMatchObject({ code: "ZOVII_ERROR" });
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", errorCode: "ZOVII_ERROR" })
      })
    );
  });

  it("reconciles a timed-out retry when the balance already changed (no double-apply)", async () => {
    const failedResult = JSON.stringify({
      memberId: "zovii-student-1",
      action: "allocate",
      amount: 100,
      description: null,
      balanceBefore: 100
    });
    mocks.opFindUnique.mockResolvedValue({
      ...pendingOperation(),
      status: "FAILED",
      attempts: 1,
      result: failedResult
    });
    mocks.opUpdate.mockResolvedValue({
      ...pendingOperation(),
      status: "PENDING",
      attempts: 2,
      result: failedResult
    });
    const setMemberCredits = vi.fn();
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [
          {
            id: "zovii-student-1",
            userId: "zovii-student-1",
            role: "member",
            enterpriseBalance: 200
          }
        ],
        total: 1
      }),
      getEnterpriseBalance: vi.fn().mockResolvedValue({ poolBalance: 500 }),
      setMemberCredits
    } as never;

    const result = await adjustMemberCredits(
      integrationAdminUser,
      {
        memberId: "zovii-student-1",
        action: "allocate",
        amount: 100,
        confirm: true,
        operationId: "operation-00000001"
      },
      client
    );

    expect(result.replayed).toBe(true);
    expect(setMemberCredits).not.toHaveBeenCalled();
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          result: expect.stringContaining("reconciled")
        })
      })
    );
  });

  it("re-executes when reconciliation shows the balance is unchanged", async () => {
    const failedResult = JSON.stringify({
      memberId: "zovii-student-1",
      action: "allocate",
      amount: 100,
      description: null,
      balanceBefore: 100
    });
    mocks.opFindUnique.mockResolvedValue({
      ...pendingOperation(),
      status: "FAILED",
      attempts: 1,
      result: failedResult
    });
    mocks.opUpdate.mockResolvedValue({
      ...pendingOperation(),
      status: "PENDING",
      attempts: 2,
      result: failedResult
    });
    const setMemberCredits = vi.fn().mockResolvedValue({});
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [
          {
            id: "zovii-student-1",
            userId: "zovii-student-1",
            role: "member",
            enterpriseBalance: 100
          }
        ],
        total: 1
      }),
      getEnterpriseBalance: vi.fn().mockResolvedValue({ poolBalance: 500 }),
      setMemberCredits
    } as never;

    const result = await adjustMemberCredits(
      integrationAdminUser,
      {
        memberId: "zovii-student-1",
        action: "allocate",
        amount: 100,
        confirm: true,
        operationId: "operation-00000001"
      },
      client
    );

    expect(result.replayed).toBe(false);
    expect(setMemberCredits).toHaveBeenCalledTimes(1);
  });
});
