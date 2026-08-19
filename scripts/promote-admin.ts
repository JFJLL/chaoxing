import { db } from "@/lib/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("用法：npm run admin:promote -- 用户邮箱");
  const user = await db.user.update({
    where: { email },
    data: { role: "ADMIN" },
    select: { id: true, name: true, email: true, role: true }
  });
  console.log(`已将 ${user.name}（${user.email}）设置为 ${user.role}。请重新登录以刷新会话权限。`);
}

void main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
