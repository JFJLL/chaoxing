import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
}

test("login page renders credential fields", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByLabel("邮箱")).toBeVisible();
  await expect(page.getByLabel("密码")).toBeVisible();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
});

test("wrong password stays on login and shows an error", async ({ page }) => {
  await login(page, "li.suyan@example.local", "WrongPassword");

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByText("邮箱或密码错误")).toBeVisible();
});

test("teacher credentials redirect to space and logout returns to login", async ({ page }) => {
  await login(page, "li.suyan@example.local", "Teacher@2026");
  await expect(page).toHaveURL(/\/space/);

  await page.getByRole("button", { name: /李素艳/ }).click();
  await page.getByRole("button", { name: "退出空间" }).click();
  await expect(page).toHaveURL(/\/login/);
});
