import { expect, type Page } from "@playwright/test";

const credentialsByName = {
  "李素艳": { email: "li.suyan@example.local", password: "Teacher@2026" },
  "王一帆": { email: "wang.yifan@example.local", password: "Teacher@2026" },
  "学习者": { email: "student@example.local", password: "Student@2026" }
} as const;

export async function loginAs(page: Page, name: keyof typeof credentialsByName = "李素艳") {
  const credentials = credentialsByName[name];
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(credentials.email);
  await page.getByLabel("密码").fill(credentials.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/space/);
}

export async function firstTaughtCourseId(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/courses?tab=taught");
    const body = await response.json();
    return body.courses[0].id as string;
  });
}
