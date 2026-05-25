import { db } from "@/lib/db";

export default async function LoginPage() {
  const users = await db.user.findMany({
    orderBy: [{ role: "desc" }, { name: "asc" }],
    include: { institution: true }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-panel">
        <p className="text-sm text-slate-500">本地开发登录</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">选择个人空间账号</h1>
        <div className="mt-6 space-y-3">
          {users.map((user) => (
            <form key={user.id} action="/api/auth/login" method="post">
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left transition hover:border-chaoxing-sidebar hover:bg-blue-50"
              >
                <span>
                  <span className="block font-medium text-slate-900">{user.name}</span>
                  <span className="block text-sm text-slate-500">{user.institution.name}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {user.role === "TEACHER" ? "教师" : user.role === "ADMIN" ? "管理员" : "学生"}
                </span>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
