import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoviiError } from "../../src/lib/zovii/errors";

const mocks = vi.hoisted(() => ({
  integrationFindUnique: vi.fn(),
  integrationCreate: vi.fn(),
  integrationUpdate: vi.fn(),
  adminFindUnique: vi.fn(),
  adminFindMany: vi.fn(),
  adminUpsert: vi.fn(),
  adminDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  identityFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  opFindUnique: vi.fn(),
  opCreate: vi.fn(),
  opUpdate: vi.fn(),
  opFindMany: vi.fn(),
  decryptSecret: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    institutionIntegration: {
      findUnique: mocks.integrationFindUnique,
      create: mocks.integrationCreate,
      update: mocks.integrationUpdate
    },
    institutionIntegrationAdmin: {
      findUnique: mocks.adminFindUnique,
      findMany: mocks.adminFindMany,
      upsert: mocks.adminUpsert,
      deleteMany: mocks.adminDeleteMany
    },
    user: {
      findUnique: mocks.userFindUnique,
      findMany: mocks.userFindMany,
      count: mocks.userCount
    },
    externalIdentity: {
      findFirst: mocks.identityFindFirst
    },
    auditLog: {
      create: mocks.auditLogCreate
    },
    externalOperation: {
      findUnique: mocks.opFindUnique,
      create: mocks.opCreate,
      update: mocks.opUpdate,
      findMany: mocks.opFindMany
    }
  }
}));

vi.mock("../../src/lib/zovii/crypto", () => ({
  decryptSecret: mocks.decryptSecret
}));

import {
  grantIntegrationAdmin,
  getEnterpriseOverview,
  inviteEnterpriseMember,
  listEnterpriseOperations,
  listEnterpriseMembers,
  listIntegrationAdmins,
  resolvePoolBalance,
  requireIntegrationAdmin,
  revokeIntegrationAdmin,
  setEnterpriseMemberRole,
  setInstitutionIntegration
} from "../../src/lib/zovii/enterprise";

const adminUser = {
  id: "admin-1",
  name: "管理员",
  role: "ADMIN",
  institutionId: "institution-1"
} as const;

const integrationAdminUser = {
  id: "teacher-1",
  name: "李素艳",
  role: "TEACHER",
  institutionId: "institution-1"
} as const;

const studentUser = {
  id: "student-1",
  name: "学习者",
  role: "STUDENT",
  institutionId: "institution-1"
} as const;

function linkedIdentity(externalUserId = "zovii-student-1") {
  return {
    id: "identity-1",
    userId: "student-1",
    provider: "ZOVII",
    externalUserId,
    phone: "13800000000",
    status: "LINKED",
    encryptedCredential: "enc-1",
    createdAt: new Date("2026-08-13T00:00:00.000Z")
  };
}

function pendingOperation() {
  return {
    id: "op-1",
    kind: "ENTERPRISE_INVITE",
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

describe("institution integration configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.integrationFindUnique.mockResolvedValue(null);
    mocks.adminFindUnique.mockResolvedValue(null);
    mocks.auditLogCreate.mockResolvedValue({ id: "log-1" });
    mocks.integrationCreate.mockResolvedValue({ id: "integration-1" });
    mocks.integrationUpdate.mockResolvedValue({ id: "integration-1" });
  });

  it("creates the integration and audits the configuration", async () => {
    const result = await setInstitutionIntegration({
      institutionId: "institution-1",
      enterpriseId: "enterprise-1",
      configuredById: adminUser.id
    });

    expect(result.enterpriseId).toBe("enterprise-1");
    expect(mocks.integrationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        institutionId: "institution-1",
        provider: "ZOVII",
        enterpriseId: "enterprise-1",
        configuredById: adminUser.id
      })
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: adminUser.id,
        action: "institution_integration_configure"
      })
    });
  });

  it("updates the enterprise id and records the audit on change", async () => {
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-old"
    });

    await setInstitutionIntegration({
      institutionId: "institution-1",
      enterpriseId: "enterprise-new",
      configuredById: adminUser.id
    });

    expect(mocks.integrationUpdate).toHaveBeenCalledWith({
      where: { id: "integration-1" },
      data: expect.objectContaining({
        enterpriseId: "enterprise-new",
        enabled: true,
        configuredById: adminUser.id
      })
    });
    expect(mocks.integrationCreate).not.toHaveBeenCalled();
  });

  it("grants and revokes integration admin with audit records", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "teacher-1", institutionId: "institution-1" });
    mocks.adminUpsert.mockResolvedValue({ id: "grant-1" });
    mocks.adminDeleteMany.mockResolvedValue({ count: 1 });

    await grantIntegrationAdmin({
      institutionId: "institution-1",
      targetUserId: "teacher-1",
      grantedById: adminUser.id
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "institution_integration_admin_grant",
        entityId: "teacher-1"
      })
    });

    await revokeIntegrationAdmin({
      institutionId: "institution-1",
      targetUserId: "teacher-1",
      revokedById: adminUser.id
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "institution_integration_admin_revoke"
      })
    });
  });

  it("rejects granting a user from another institution", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "teacher-x", institutionId: "institution-2" });

    await expect(
      grantIntegrationAdmin({
        institutionId: "institution-1",
        targetUserId: "teacher-x",
        grantedById: adminUser.id
      })
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
  });
});

describe("requireIntegrationAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue(null);
    mocks.integrationFindUnique.mockResolvedValue(null);
  });

  it("rejects users without an explicit grant", async () => {
    await expect(requireIntegrationAdmin(integrationAdminUser)).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
  });

  it("rejects TEACHER without grant even when the enterprise is configured", async () => {
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });

    await expect(requireIntegrationAdmin(integrationAdminUser)).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
  });

  it("allows an explicitly granted integration admin when configured", async () => {
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1", userId: "teacher-1" });
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });

    await expect(requireIntegrationAdmin(integrationAdminUser)).resolves.toBeUndefined();
  });

  it("rejects when the institution is not configured", async () => {
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1", userId: "teacher-1" });

    await expect(requireIntegrationAdmin(integrationAdminUser)).rejects.toMatchObject({
      code: "NOT_CONFIGURED"
    });
  });
});

describe("listEnterpriseMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });
    mocks.identityFindFirst.mockResolvedValue(linkedIdentity());
    mocks.decryptSecret.mockReturnValue("refresh-1");
    mocks.userFindMany.mockResolvedValue([
      {
        id: "student-1",
        name: "学习者",
        email: "student@example.local",
        phone: "13800000000",
        role: "STUDENT", externalIdentities: [linkedIdentity()]
      },
      {
        id: "student-2",
        name: "未关联学生",
        email: "student2@example.local",
        phone: null,
        role: "STUDENT", externalIdentities: []
      }
    ]);
    mocks.userCount.mockResolvedValue(2);
  });

  it("merges Chaoxing students with Zovii enterprise members by external user id", async () => {
    const client = {
      getEnterpriseMembers: vi.fn().mockResolvedValue({
        members: [
          {
            id: "zovii-student-1",
            userId: "zovii-student-1",
            displayId: "student-1",
            username: "学习者",
            role: "member",
            enterpriseBalance: 120.5,
            consumption: 30,
            callCount: 12,
            joinedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        total: 1,
        page: 1,
        limit: 20
      }),
      getEnterpriseBalance: vi.fn()
    } as never;

    const page = await listEnterpriseMembers(integrationAdminUser, { page: 1, limit: 20 }, client);

    expect(page.items).toHaveLength(2);
    const linked = page.items.find((item) => item.chaoxingUserId === "student-1");
    expect(linked?.linked).toBe(true);
    expect(linked?.enterpriseMember).toMatchObject({
      id: "zovii-student-1",
      role: "member",
      enterpriseBalance: 120.5,
      consumption: 30,
      callCount: 12
    });
    const unlinked = page.items.find((item) => item.chaoxingUserId === "student-2");
    expect(unlinked?.linked).toBe(false);
    expect(unlinked?.enterpriseMember).toBeNull();
    expect(page.total).toBe(2);
  });

  it("applies search to the local roster and fetches the full Zovii roster for the join", async () => {
    const getEnterpriseMembers = vi.fn().mockResolvedValue({ members: [], total: 0, page: 1, limit: 200 });
    const client = { getEnterpriseMembers } as never;

    await listEnterpriseMembers(integrationAdminUser, { page: 1, limit: 20, search: "学习者" }, client);

    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ name: { contains: "学习者" } }, { email: { contains: "学习者" } }, { phone: { contains: "学习者" } }]
        })
      })
    );
    expect(getEnterpriseMembers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 1, limit: 200 })
    );
    expect(getEnterpriseMembers).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ search: "学习者" })
    );
  });

  it("rejects a plain teacher without explicit grant", async () => {
    mocks.adminFindUnique.mockResolvedValue(null);
    const client = {} as never;

    await expect(
      listEnterpriseMembers(integrationAdminUser, { page: 1, limit: 20 }, client)
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
  });
});

describe("inviteEnterpriseMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });
    mocks.identityFindFirst.mockResolvedValue(linkedIdentity());
    mocks.decryptSecret.mockReturnValue("refresh-1");
    mocks.opFindUnique.mockResolvedValue(null);
    mocks.opCreate.mockResolvedValue(pendingOperation());
    mocks.opUpdate.mockResolvedValue({ id: "op-1" });
  });

  it("creates a link invite through the real Zovii API and records the operation", async () => {
    const inviteMember = vi.fn().mockResolvedValue({ token: "invite-token-abc" });
    const client = { inviteMember, baseUrl: "https://zovii.test" } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-1",
      institutionId: "institution-1",
      role: "STUDENT", externalIdentities: [linkedIdentity()]
    });

    const result = await inviteEnterpriseMember(
      integrationAdminUser,
      { targetUserId: "student-1", role: "member", operationId: "operation-00000001" },
      client
    );

    expect(result).toEqual({
      inviteUrl: "https://zovii.test/enterprise/invite/invite-token-abc",
      replayed: false
    });
    expect(inviteMember).toHaveBeenCalledWith(expect.anything(), {
      type: "link",
      role: "member"
    });
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          result: expect.stringContaining("invite-token-abc")
        })
      })
    );
  });

  it("requires the student to be linked to Zovii first", async () => {
    const inviteMember = vi.fn();
    const client = { inviteMember } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-2",
      institutionId: "institution-1",
      role: "STUDENT", externalIdentities: []
    });

    await expect(
      inviteEnterpriseMember(
        integrationAdminUser,
        { targetUserId: "student-2", role: "member", operationId: "operation-00000002" },
        client
      )
    ).rejects.toMatchObject({ code: "TARGET_NOT_LINKED" });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("rejects targets from another institution", async () => {
    const inviteMember = vi.fn();
    const client = { inviteMember } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-x",
      institutionId: "institution-2",
      role: "STUDENT", externalIdentities: []
    });

    await expect(
      inviteEnterpriseMember(
        integrationAdminUser,
        { targetUserId: "student-x", role: "member", operationId: "operation-00000003" },
        client
      )
    ).rejects.toMatchObject({ code: "NOT_SAME_INSTITUTION" });
  });

  it("returns the stored invite URL on replay without calling Zovii again", async () => {
    const inviteMember = vi.fn();
    const client = { inviteMember } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-1",
      institutionId: "institution-1",
      role: "STUDENT", externalIdentities: [linkedIdentity()]
    });
    mocks.opFindUnique.mockResolvedValue({
      ...pendingOperation(),
      status: "SUCCEEDED",
      result: JSON.stringify({ inviteUrl: "https://zovii.test/enterprise/invite/old-token" })
    });

    const result = await inviteEnterpriseMember(
      integrationAdminUser,
      { targetUserId: "student-1", role: "member", operationId: "operation-00000001" },
      client
    );

    expect(result).toEqual({ inviteUrl: "https://zovii.test/enterprise/invite/old-token", replayed: true });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("rejects duplicate concurrent invites with OPERATION_IN_FLIGHT", async () => {
    const inviteMember = vi.fn();
    const client = { inviteMember } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-1",
      institutionId: "institution-1",
      role: "STUDENT", externalIdentities: [linkedIdentity()]
    });
    mocks.opFindUnique.mockResolvedValue(pendingOperation());

    await expect(
      inviteEnterpriseMember(
        integrationAdminUser,
        { targetUserId: "student-1", role: "member", operationId: "operation-00000001" },
        client
      )
    ).rejects.toMatchObject({ code: "OPERATION_IN_FLIGHT" });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("maps an exhausted attempt budget to RATE_LIMITED", async () => {
    const inviteMember = vi.fn();
    const client = { inviteMember } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-1",
      institutionId: "institution-1",
      role: "STUDENT",
      externalIdentities: [linkedIdentity()]
    });
    mocks.opFindUnique.mockResolvedValue({
      ...pendingOperation(),
      status: "FAILED",
      attempts: 10,
      updatedAt: new Date()
    });

    await expect(
      inviteEnterpriseMember(
        integrationAdminUser,
        { targetUserId: "student-1", role: "member", operationId: "operation-00000001" },
        client
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("maps Zovii 403 to NOT_AUTHORIZED", async () => {
    const client = {
      inviteMember: vi.fn().mockRejectedValue(
        new ZoviiError("ENTERPRISE_ACCESS_DENIED", "no permission", { status: 403 })
      )
    } as never;
    mocks.userFindUnique.mockResolvedValue({
      id: "student-1",
      institutionId: "institution-1",
      role: "STUDENT", externalIdentities: [linkedIdentity()]
    });

    await expect(
      inviteEnterpriseMember(
        integrationAdminUser,
        { targetUserId: "student-1", role: "member", operationId: "operation-00000001" },
        client
      )
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", errorCode: "NOT_AUTHORIZED" })
      })
    );
  });
});

describe("setEnterpriseMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });
    mocks.identityFindFirst.mockResolvedValue(linkedIdentity());
    mocks.decryptSecret.mockReturnValue("refresh-1");
    mocks.opFindUnique.mockResolvedValue(null);
    mocks.opCreate.mockResolvedValue(pendingOperation());
    mocks.opUpdate.mockResolvedValue({ id: "op-1" });
  });

  it("requires explicit confirmation", async () => {
    const setMemberRole = vi.fn();
    const client = { setMemberRole } as never;

    await expect(
      setEnterpriseMemberRole(
        integrationAdminUser,
        { memberId: "zovii-student-1", role: "member", confirm: false, operationId: "operation-00000001" },
        client
      )
    ).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" });
    expect(setMemberRole).not.toHaveBeenCalled();
  });

  it("updates the role through the real Zovii API with idempotency", async () => {
    const setMemberRole = vi.fn().mockResolvedValue({});
    const getEnterpriseMembers = vi.fn().mockResolvedValue({
      members: [{ id: "zovii-student-1", userId: "zovii-student-1", role: "member" }],
      total: 1
    });
    const client = { setMemberRole, getEnterpriseMembers } as never;
    mocks.userFindUnique.mockResolvedValue({ institutionId: "institution-1" });
    mocks.identityFindFirst.mockResolvedValue({
      id: "identity-1",
      userId: "student-1",
      provider: "ZOVII",
      externalUserId: "zovii-student-1",
      status: "LINKED",
      encryptedCredential: "enc-1"
    });

    const result = await setEnterpriseMemberRole(
      integrationAdminUser,
      { memberId: "zovii-student-1", role: "enterprise_admin", confirm: true, operationId: "operation-00000001" },
      client
    );

    expect(result.replayed).toBe(false);
    expect(setMemberRole).toHaveBeenCalledWith(expect.anything(), "zovii-student-1", "enterprise_admin");
    expect(mocks.opUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          result: expect.stringContaining("enterprise_admin")
        })
      })
    );
  });

  it("rejects a member id that is not a linked identity of the school", async () => {
    const client = { setMemberRole: vi.fn(), getEnterpriseMembers: vi.fn() } as never;
    mocks.identityFindFirst.mockResolvedValue(null);

    await expect(
      setEnterpriseMemberRole(
        integrationAdminUser,
        { memberId: "zovii-other", role: "member", confirm: true, operationId: "operation-00000001" },
        client
      )
    ).rejects.toMatchObject({ code: "NOT_ENTERPRISE_MEMBER" });
  });
});

describe("getEnterpriseOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue(null);
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });
  });

  it("rejects students and teachers without an explicit grant", async () => {
    await expect(getEnterpriseOverview(studentUser)).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
    await expect(getEnterpriseOverview(integrationAdminUser)).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
  });

  it("returns configured=false gracefully for a granted admin without configuration", async () => {
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.integrationFindUnique.mockResolvedValue(null);

    await expect(getEnterpriseOverview(integrationAdminUser)).resolves.toEqual({
      configured: false,
      enterpriseId: null,
      poolBalance: null,
      memberCount: null
    });
  });

  it("returns pool balance and member count for a granted admin", async () => {
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.identityFindFirst.mockResolvedValue({
      id: "identity-1",
      externalUserId: "zovii-teacher-1",
      status: "LINKED",
      encryptedCredential: "enc-1"
    });
    mocks.decryptSecret.mockReturnValue("refresh-1");
    const client = {
      getEnterpriseBalance: vi.fn().mockResolvedValue({ poolBalance: 500 }),
      getEnterpriseMembers: vi.fn().mockResolvedValue({ members: [], total: 3 })
    } as never;

    const overview = await getEnterpriseOverview(integrationAdminUser, client);
    expect(overview).toEqual({
      configured: true,
      enterpriseId: "enterprise-1",
      poolBalance: 500,
      memberCount: 3
    });
  });
});

describe("listIntegrationAdmins", () => {
  it("returns admin records with user details", async () => {
    mocks.adminFindMany.mockResolvedValue([
      {
        id: "grant-1",
        userId: "teacher-1",
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        user: { id: "teacher-1", name: "李素艳", email: "li.suyan@example.local" }
      }
    ]);

    const admins = await listIntegrationAdmins("institution-1");
    expect(admins).toEqual([
      {
        id: "grant-1",
        userId: "teacher-1",
        name: "李素艳",
        email: "li.suyan@example.local",
        grantedAt: "2026-08-13T00:00:00.000Z"
      }
    ]);
  });
});

describe("listEnterpriseOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFindUnique.mockResolvedValue({ id: "grant-1" });
    mocks.integrationFindUnique.mockResolvedValue({
      id: "integration-1",
      enterpriseId: "enterprise-1",
      enabled: true
    });
  });

  it("returns sanitized operation records for the institution", async () => {
    mocks.opFindMany.mockResolvedValue([
      {
        id: "op-1",
        kind: "ENTERPRISE_CREDITS",
        status: "SUCCEEDED",
        result: JSON.stringify({ memberId: "zovii-student-1", action: "allocate", amount: 100 }),
        errorCode: null,
        externalRequestId: "req-1",
        createdAt: new Date("2026-08-13T09:00:00.000Z"),
        updatedAt: new Date("2026-08-13T09:00:00.000Z")
      }
    ]);
    const result = await listEnterpriseOperations(integrationAdminUser, { limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "ENTERPRISE_CREDITS",
      status: "SUCCEEDED",
      result: { memberId: "zovii-student-1", action: "allocate", amount: 100 }
    });
    expect(mocks.opFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ institutionId: "institution-1" }),
        take: 10
      })
    );
  });

  it("rejects users without a grant", async () => {
    mocks.adminFindUnique.mockResolvedValue(null);
    await expect(listEnterpriseOperations(integrationAdminUser, {})).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
  });
});

describe("resolvePoolBalance", () => {
  it("resolves the pool balance with a stable cascade", () => {
    expect(resolvePoolBalance({ poolBalance: 100, available: 200, balance: 300 })).toBe(100);
    expect(resolvePoolBalance({ available: 200 })).toBe(200);
    expect(resolvePoolBalance({ balance: 300 })).toBe(300);
    expect(resolvePoolBalance({})).toBeNull();
  });
});
