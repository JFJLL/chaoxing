import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EnterpriseConfigCard } from "@/components/settings/enterprise/EnterpriseConfigCard";
import { EnterpriseMembersCard } from "@/components/settings/enterprise/EnterpriseMembersCard";

export default async function EnterpriseSettingsPage() {
  const user = await requireUser();
  const [integration, grant] = await Promise.all([
    db.institutionIntegration.findUnique({
      where: { institutionId_provider: { institutionId: user.institutionId, provider: "ZOVII" } }
    }),
    db.institutionIntegrationAdmin.findUnique({
      where: { institutionId_userId: { institutionId: user.institutionId, userId: user.id } }
    })
  ]);

  const isPlatformAdmin = user.role === "ADMIN";
  const isIntegrationAdmin = Boolean(grant);
  const configured = Boolean(integration && integration.enabled);

  if (!isPlatformAdmin && !isIntegrationAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-lg font-medium text-slate-900">学校企业管理</h1>
          <p className="mt-2 text-sm text-slate-500">
            只有被学校明确授权的集成管理员可以管理 Zovii 企业成员与积分。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">学校企业管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          配置学校对应的 Zovii 企业，管理学生成员身份与企业积分。
        </p>
      </header>

      {isPlatformAdmin ? (
        <EnterpriseConfigCard
          institutionId={user.institutionId}
          initialEnterpriseId={integration?.enterpriseId ?? ""}
        />
      ) : null}

      {isIntegrationAdmin && configured ? (
        <EnterpriseMembersCard institutionId={user.institutionId} />
      ) : null}

      {isIntegrationAdmin && !configured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          学校尚未配置 Zovii 企业。请联系学校管理员在“企业关联配置”中填写企业 ID。
        </div>
      ) : null}
    </main>
  );
}
