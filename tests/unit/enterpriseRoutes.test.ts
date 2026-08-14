import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listEnterpriseMembers: vi.fn(),
  getEnterpriseOverview: vi.fn(),
  inviteEnterpriseMember: vi.fn(),
  setEnterpriseMemberRole: vi.fn(),
  adjustMemberCredits: vi.fn(),
  setInstitutionIntegration: vi.fn(),
  grantIntegrationAdmin: vi.fn(),
  revokeIntegrationAdmin: vi.fn(),
  getInstitutionIntegration: vi.fn(),
  listIntegrationAdmins: vi.fn(),
  adminFindUnique: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/zovii/enterprise", () => ({
  listEnterpriseMembers: mocks.listEnterpriseMembers,
  getEnterpriseOverview: mocks.getEnterpriseOverview,
  inviteEnterpriseMember: mocks.inviteEnterpriseMember,
  setEnterpriseMemberRole: mocks.setEnterpriseMemberRole,
  adjustMemberCredits: mocks.adjustMemberCredits,
  setInstitutionIntegration: mocks.setInstitutionIntegration,
  grantIntegrationAdmin: mocks.grantIntegrationAdmin,
  revokeIntegrationAdmin: mocks.revokeIntegrationAdmin,
  getInstitutionIntegration: mocks.getInstitutionIntegration,
  listIntegrationAdmins: mocks.listIntegrationAdmins,
  ENTERPRISE_ROLES: ["member", "enterprise_admin"],
  CREDIT_ACTIONS: ["allocate", "adjust"],
  MAX_CREDIT_AMOUNT: 1_000_000,
  EnterpriseAccessError: class EnterpriseAccessError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "EnterpriseAccessError";
    }
  }
}));

vi.mock("@/lib/db", () => ({
  db: {
    institutionIntegrationAdmin: {
      findUnique: mocks.adminFindUnique
    }
  }
}));

import { POST as invitePOST } from "@/app/api/enterprise/members/invite/route";
import { GET as membersGET } from "@/app/api/enterprise/members/route";
import { GET as overviewGET } from "@/app/api/enterprise/overview/route";
import { GET as configGET, POST as configPOST } from "@/app/api/institution/integration/route";
import { DELETE as revokeDELETE } from "@/app/api/institution/integration/admins/[userId]/route";
import { EnterpriseAccessError } from "@/lib/zovii/enterprise";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const admin = { id: "admin-1", name: "管理员", role: "ADMIN", institutionId: "institution-1" };
const teacher = { id: "teacher-1", name: "李素艳", role: "TEACHER", institutionId: "institution-1" };
const student = { id: "student-1", name: "学习者", role: "STUDENT", institutionId: "institution-1" };

describe("enterprise member routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacher);
    mocks.listEnterpriseMembers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    mocks.getEnterpriseOverview.mockResolvedValue({
      configured: true,
      enterpriseId: "enterprise-1",
      poolBalance: 500,
      memberCount: 3
    });
    mocks.inviteEnterpriseMember.mockResolvedValue({
      inviteUrl: "https://zovii.test/enterprise/invite/token-1",
      replayed: false
    });
  });

  it("member list rejects a plain student", async () => {
    mocks.requireUser.mockResolvedValue(student);
    mocks.listEnterpriseMembers.mockRejectedValue(
      new EnterpriseAccessError("NOT_AUTHORIZED", "无权管理学校企业设置")
    );

    const response = await membersGET(
      new NextRequest("http://localhost/api/enterprise/members?page=1&limit=20")
    );
    expect(response.status).toBe(403);
  });

  it("member list passes search and pagination to the service", async () => {
    const response = await membersGET(
      new NextRequest("http://localhost/api/enterprise/members?page=2&limit=10&search=王")
    );

    expect(response.status).toBe(200);
    expect(mocks.listEnterpriseMembers).toHaveBeenCalledWith(teacher, {
      page: 2,
      limit: 10,
      search: "王"
    });
  });

  it("invite requires a valid role and operation id", async () => {
    const response = await invitePOST(
      jsonRequest("/api/enterprise/members/invite", {
        targetUserId: "student-1",
        role: "superuser",
        operationId: "operation-00000001"
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.inviteEnterpriseMember).not.toHaveBeenCalled();
  });

  it("invite succeeds for an integration admin", async () => {
    const response = await invitePOST(
      jsonRequest("/api/enterprise/members/invite", {
        targetUserId: "student-1",
        role: "member",
        operationId: "operation-00000001"
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      inviteUrl: "https://zovii.test/enterprise/invite/token-1"
    });
    expect(mocks.inviteEnterpriseMember).toHaveBeenCalledWith(
      teacher,
      expect.objectContaining({ targetUserId: "student-1", role: "member" })
    );
  });

  it("invite maps NOT_AUTHORIZED to 403", async () => {
    mocks.inviteEnterpriseMember.mockRejectedValue(
      new EnterpriseAccessError("NOT_AUTHORIZED", "无权管理学校企业设置")
    );
    const response = await invitePOST(
      jsonRequest("/api/enterprise/members/invite", {
        targetUserId: "student-1",
        role: "member",
        operationId: "operation-00000001"
      })
    );
    expect(response.status).toBe(403);
  });

  it("overview loads for the integration admin", async () => {
    const response = await overviewGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ poolBalance: 500, memberCount: 3 });
  });
});

describe("credits route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacher);
    mocks.adjustMemberCredits.mockResolvedValue({ replayed: false, poolBalance: null });
  });

  it("validates amount and action", async () => {
    const route = await import("@/app/api/enterprise/members/[memberId]/credits/route");
    const response = await route.POST(
      jsonRequest("/api/enterprise/members/zovii-student-1/credits", {
        action: "allocate",
        amount: 0,
        confirm: true,
        operationId: "operation-00000001"
      }),
      { params: Promise.resolve({ memberId: "zovii-student-1" }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.adjustMemberCredits).not.toHaveBeenCalled();
  });

  it("maps INSUFFICIENT_BALANCE to 409", async () => {
    mocks.adjustMemberCredits.mockRejectedValue(
      new EnterpriseAccessError("INSUFFICIENT_BALANCE", "企业积分池余额不足，无法分配")
    );
    const route = await import("@/app/api/enterprise/members/[memberId]/credits/route");
    const response = await route.POST(
      jsonRequest("/api/enterprise/members/zovii-student-1/credits", {
        action: "allocate",
        amount: 100,
        confirm: true,
        operationId: "operation-00000001"
      }),
      { params: Promise.resolve({ memberId: "zovii-student-1" }) }
    );
    expect(response.status).toBe(409);
  });

  it("succeeds for a valid deduction with confirmation", async () => {
    const route = await import("@/app/api/enterprise/members/[memberId]/credits/route");
    const response = await route.POST(
      jsonRequest("/api/enterprise/members/zovii-student-1/credits", {
        action: "adjust",
        amount: 20,
        description: "收回未使用额度",
        confirm: true,
        operationId: "operation-00000001"
      }),
      { params: Promise.resolve({ memberId: "zovii-student-1" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.adjustMemberCredits).toHaveBeenCalledWith(
      teacher,
      expect.objectContaining({
        memberId: "zovii-student-1",
        action: "adjust",
        amount: 20,
        confirm: true
      })
    );
  });
});

describe("institution config routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
    mocks.setInstitutionIntegration.mockResolvedValue({ enterpriseId: "enterprise-1" });
    mocks.grantIntegrationAdmin.mockResolvedValue(undefined);
    mocks.revokeIntegrationAdmin.mockResolvedValue(undefined);
    mocks.adminFindUnique.mockResolvedValue(null);
    mocks.getInstitutionIntegration.mockResolvedValue({
      id: "integration-1",
      institutionId: "institution-1",
      provider: "ZOVII",
      enterpriseId: "enterprise-1",
      enabled: true
    });
  });

  it("rejects configuration by a teacher", async () => {
    mocks.requireUser.mockResolvedValue(teacher);
    const response = await configPOST(
      jsonRequest("/api/institution/integration", { enterpriseId: "enterprise-1" })
    );
    expect(response.status).toBe(403);
    expect(mocks.setInstitutionIntegration).not.toHaveBeenCalled();
  });

  it("allows the platform admin to configure the enterprise id", async () => {
    const response = await configPOST(
      jsonRequest("/api/institution/integration", { enterpriseId: "enterprise-1" })
    );
    expect(response.status).toBe(200);
    expect(mocks.setInstitutionIntegration).toHaveBeenCalledWith({
      institutionId: "institution-1",
      enterpriseId: "enterprise-1",
      configuredById: "admin-1"
    });
  });

  it("rejects empty enterprise ids", async () => {
    const response = await configPOST(
      jsonRequest("/api/institution/integration", { enterpriseId: "  " })
    );
    expect(response.status).toBe(400);
    expect(mocks.setInstitutionIntegration).not.toHaveBeenCalled();
  });

  it("hides the enterprise id from students on GET", async () => {
    const route = await import("@/app/api/institution/integration/route");
    mocks.requireUser.mockResolvedValue(student);
    const response = await route.GET();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { enterpriseId: string | null; canView: boolean };
    expect(payload.enterpriseId).toBeNull();
    expect(payload.canView).toBe(false);
  });

  it("shows the enterprise id to the platform admin on GET", async () => {
    const route = await import("@/app/api/institution/integration/route");
    const response = await route.GET();
    const payload = (await response.json()) as { canView: boolean };
    expect(payload.canView).toBe(true);
  });

  it("revoke requires the ADMIN role", async () => {
    mocks.requireUser.mockResolvedValue(teacher);
    const response = await revokeDELETE(
      new NextRequest("http://localhost/api/institution/integration/admins/teacher-1", { method: "DELETE" }),
      { params: Promise.resolve({ userId: "teacher-1" }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.revokeIntegrationAdmin).not.toHaveBeenCalled();
  });
});
