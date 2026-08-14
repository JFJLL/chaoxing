import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import {
  EnterpriseAccessError,
  getInstitutionIntegration,
  grantIntegrationAdmin,
  listIntegrationAdmins,
  setInstitutionIntegration
} from "@/lib/zovii/enterprise";

const configSchema = z.object({
  enterpriseId: z.string().trim().min(1, "请输入 Zovii 企业 ID").max(120, "企业 ID 过长")
});

const grantSchema = z.object({
  userId: z.string().min(1, "请选择用户")
});

function requireAdminRole(user: { role: string }) {
  if (user.role !== "ADMIN") {
    throw new EnterpriseAccessError("NOT_AUTHORIZED", "只有学校管理员可以配置企业关联");
  }
}

export async function GET() {
  const user = await requireUser();
  const integration = await getInstitutionIntegration(user.institutionId);
  const grant = await db.institutionIntegrationAdmin.findUnique({
    where: { institutionId_userId: { institutionId: user.institutionId, userId: user.id } }
  });
  const canView = user.role === "ADMIN" || Boolean(grant);
  return NextResponse.json({
    configured: Boolean(integration && integration.enabled),
    enterpriseId: canView ? integration?.enterpriseId ?? null : null,
    provider: integration?.provider ?? "ZOVII",
    admins: user.role === "ADMIN" ? await listIntegrationAdmins(user.institutionId) : undefined,
    canView
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  try {
    requireAdminRole(user);
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    const result = await setInstitutionIntegration({
      institutionId: user.institutionId,
      enterpriseId: parsed.data.enterpriseId,
      configuredById: user.id
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    return NextResponse.json({ error: "配置失败，请稍后重试" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  try {
    requireAdminRole(user);
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    await grantIntegrationAdmin({
      institutionId: user.institutionId,
      targetUserId: parsed.data.userId,
      grantedById: user.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "TARGET_NOT_FOUND" ? 404 : 403 }
      );
    }
    return NextResponse.json({ error: "授权失败，请稍后重试" }, { status: 502 });
  }
}
