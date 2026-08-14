import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getZoviiLinkStatus } from "@/lib/zovii/linkAccount";
import { ZoviiLinkPanel } from "@/components/settings/ZoviiLinkPanel";

export default async function SettingsPage() {
  const user = await requireUser();
  const [account, status] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { email: true }
    }),
    getZoviiLinkStatus(user.id)
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">账号设置</h1>
        <p className="mt-1 text-sm text-slate-500">管理个人资料、登录方式与平台账号关联。</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-900">基本信息</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">姓名</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{user.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">邮箱（登录账号）</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{account?.email ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-900">Zovii 账号关联</h2>
        <p className="mt-1 text-sm text-slate-500">
          使用 Zovii 短信登录验证码证明账号控制权后完成关联；解绑需要重新验证 Chaoxing 密码。
        </p>
        <div className="mt-4">
          <ZoviiLinkPanel initialStatus={status} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-slate-900">学校企业管理</h2>
            <p className="mt-1 text-sm text-slate-500">
              配置学校对应的 Zovii 企业，管理学生成员身份与企业积分。
            </p>
          </div>
          <a
            href="/settings/enterprise"
            className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            进入
          </a>
        </div>
      </section>
    </main>
  );
}
