import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("shell navigation and course/topic entry render", async ({ page }) => {
  await loginAs(page, "李素艳");
  await expect(page.getByText("北京市东城区第一图书馆")).toBeVisible();
  await page.getByRole("link", { name: "课程", exact: true }).click();
  await expect(page.getByRole("link", { name: "我学的课" })).toBeVisible();
  await expect(page.getByRole("link", { name: "我教的课" })).toBeVisible();
  await page.goto("/space/courses?tab=taught");
  await expect(page.getByRole("button", { name: /新建课程/ })).toBeVisible();
  await page.getByRole("link", { name: "专题创作", exact: true }).click();
  await expect(page.getByRole("button", { name: "新建专题" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建文件夹" })).toBeVisible();
});
