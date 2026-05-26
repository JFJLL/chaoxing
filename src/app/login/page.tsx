type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES = {
  invalid_credentials: "邮箱或密码错误",
  invalid_form: "请输入有效邮箱和密码"
} as const;

const DEV_CREDENTIALS = [
  { label: "教师账号 1", email: "li.suyan@example.local", password: "Teacher@2026" },
  { label: "教师账号 2", email: "wang.yifan@example.local", password: "Teacher@2026" },
  { label: "学生账号", email: "student@example.local", password: "Student@2026" }
];

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error =
    params.error && params.error in ERROR_MESSAGES
      ? ERROR_MESSAGES[params.error as keyof typeof ERROR_MESSAGES]
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-panel">
        <p className="text-sm text-slate-500">账号登录</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">登录个人空间</h1>
        <p className="mt-2 text-sm text-slate-500">使用邮箱和密码访问课程、专题、小组与个人空间。</p>
        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-chaoxing-sidebar focus:ring-2 focus:ring-blue-100"
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
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 outline-none transition focus:border-chaoxing-sidebar focus:ring-2 focus:ring-blue-100"
              placeholder="请输入密码"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-chaoxing-sidebar px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            登录
          </button>
        </form>
        {process.env.NODE_ENV !== "production" ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">开发环境账号</p>
            <ul className="mt-3 space-y-2">
              {DEV_CREDENTIALS.map((credential) => (
                <li key={credential.email}>
                  <span className="block text-slate-900">{credential.label}</span>
                  <span className="block">{credential.email}</span>
                  <span className="block">密码：{credential.password}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}
