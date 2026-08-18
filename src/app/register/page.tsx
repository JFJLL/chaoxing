import Link from "next/link";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES = {
  email_exists: "该邮箱已被注册",
  invalid_form: "请填写完整且有效的注册信息"
} as const;

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error =
    params.error && params.error in ERROR_MESSAGES
      ? ERROR_MESSAGES[params.error as keyof typeof ERROR_MESSAGES]
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-panel">
        <img src="/logo.png" alt="平台 Logo" className="h-12 w-auto object-contain" />
        <p className="mt-6 text-sm text-slate-500">账号注册</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">注册新账号</h1>
        <p className="mt-2 text-sm text-slate-500">创建您的账号以访问课程、专题与学习空间。</p>
        <form action="/api/auth/register" method="post" className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-slate-700">
              姓名
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="请输入您的姓名"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="name@example.local"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="至少 6 位密码"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium text-slate-700">
              身份
            </label>
            <select
              id="role"
              name="role"
              defaultValue="STUDENT"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-yimei-sidebar focus:ring-2 focus:ring-blue-100"
            >
              <option value="STUDENT">学生 (学习者)</option>
              <option value="TEACHER">教师 (授课者)</option>
            </select>
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-yimei-sidebar px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            注册并登录
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-500">
          已有账号？{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            直接登录
          </Link>
        </div>
      </section>
    </main>
  );
}
