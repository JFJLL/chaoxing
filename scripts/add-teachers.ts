/**
 * 批量添加老师账号（默认只预览，加 --apply 才真正写入数据库）。
 *
 * 用法：
 *   npm run add:teachers                  # 预览：列出将要创建的账号
 *   npm run add:teachers -- --apply       # 写入：创建不存在的老师账号
 *
 * 可选环境变量：
 *   TEACHER_DEFAULT_PASSWORD   默认密码（缺省 Scim2026）
 *   TEACHER_INSTITUTION_NAME   按名称指定机构（缺省取库中第一个机构）
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/passwords";

type TeacherRow = {
  name: string;
  email: string;
  confirm?: boolean;
  note?: string;
};

const DEFAULT_PASSWORD = process.env.TEACHER_DEFAULT_PASSWORD ?? "Scim2026";
const INSTITUTION_NAME = process.env.TEACHER_INSTITUTION_NAME;

function loadTeachers(): TeacherRow[] {
  const raw = readFileSync(resolve(__dirname, "data/teachers-2026.json"), "utf8");
  return JSON.parse(raw) as TeacherRow[];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const teachers = loadTeachers();

  const duplicateEmails = teachers
    .map((t) => t.email)
    .filter((email, index, all) => all.indexOf(email) !== index);
  if (duplicateEmails.length > 0) {
    throw new Error(`名单中存在重复邮箱：${[...new Set(duplicateEmails)].join("、")}`);
  }

  const institution = INSTITUTION_NAME
    ? await db.institution.findFirst({ where: { name: INSTITUTION_NAME } })
    : await db.institution.findFirst({ orderBy: { createdAt: "asc" } });

  if (!institution) {
    throw new Error(
      "未找到机构（Institution）。请确认数据库中已有机构，或设置 TEACHER_INSTITUTION_NAME 指定机构名称。"
    );
  }

  console.log(`模式：${apply ? "写入（--apply）" : "预览（dry-run，加 --apply 才会写入）"}`);
  console.log(`机构：${institution.name}（${institution.id}）`);
  if (!INSTITUTION_NAME) {
    console.warn("⚠️ 未设置 TEACHER_INSTITUTION_NAME，默认绑定库中第一个机构；如服务器存在多个机构，请先确认。");
  }
  console.log(`默认密码：${apply ? DEFAULT_PASSWORD : "（预览不显示）"}`);
  console.log(`名单人数：${teachers.length}`);
  console.log("");

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const teacher of teachers) {
    const existing = await db.user.findUnique({
      where: { email: teacher.email },
      select: { id: true, name: true, role: true }
    });

    if (existing) {
      const roleNote = existing.role !== "TEACHER" ? `（注意：现有角色为 ${existing.role}）` : "";
      console.log(`跳过 ${teacher.name} <${teacher.email}> — 账号已存在（${existing.name}）${roleNote}`);
      skipped += 1;
      continue;
    }

    if (!apply) {
      console.log(`[待创建] ${teacher.name} <${teacher.email}>`);
      created += 1;
      continue;
    }

    try {
      await db.user.create({
        data: {
          name: teacher.name,
          email: teacher.email,
          passwordHash: await hashPassword(DEFAULT_PASSWORD),
          role: "TEACHER",
          institutionId: institution.id
        }
      });
      console.log(`已创建 ${teacher.name} <${teacher.email}>`);
      created += 1;
    } catch (error) {
      console.error(`创建失败 ${teacher.name} <${teacher.email}>：${(error as Error).message}`);
      failed += 1;
    }
  }

  const pendingConfirmations = teachers.filter((t) => t.confirm);
  for (const teacher of pendingConfirmations) {
    console.warn(`⚠️ 需要人工确认：${teacher.name} <${teacher.email}> — ${teacher.note ?? ""}`);
  }

  console.log("");
  console.log(`汇总：新增 ${created}，跳过 ${skipped}，失败 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
