import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("shell navigation and course/topic entry render", async ({ page }) => {
  await loginAs(page, "李素艳");
  await expect(page.getByText("文化产院管理学院")).toBeVisible();
  await page.goto("/space/courses");
  await expect(page.getByRole("link", { name: "我学的课" })).toBeVisible();
  await expect(page.getByRole("link", { name: "我教的课" })).toBeVisible();
  await expect(page.getByRole("button", { name: /新建课程/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加课程" })).toHaveCount(0);
  await page.goto("/space/topics");
  await expect(page.getByRole("button", { name: "新建专题" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建文件夹" })).toBeVisible();
});

test("course list actions work through the UI", async ({ page }) => {
  await loginAs(page, "学习者");
  await page.goto("/space/courses");
  await expect(page.getByRole("link", { name: "我教的课" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新建课程/ })).toHaveCount(0);
  await page.getByRole("button", { name: "添加课程" }).click();
  await page.getByLabel("课程邀请码").fill("COURSE2026");
  await page.getByRole("button", { name: /^添加$/ }).click();
  await expect(page.getByRole("link", { name: /实操课/ })).toBeVisible();

  await loginAs(page, "李素艳");
  await page.goto("/space/courses?tab=taught");
  await page.getByRole("button", { name: "新建文件夹" }).click();
  await page.getByLabel("文件夹名称").fill("E2E 课程文件夹");
  await page.getByRole("button", { name: /^创建$/ }).click();
  await expect(page.getByRole("button", { name: "新建文件夹" })).toBeVisible();

  const title = `E2E 课程 ${Date.now()}`;
  await page.getByRole("button", { name: /新建课程/ }).click();
  await page.getByLabel("课程名称").fill(title);
  await page.getByRole("button", { name: /^创建$/ }).click();
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByText("草稿")).toBeVisible();
  await page.getByRole("button", { name: "发布课程" }).click();
  await expect(page.getByText("已发布")).toBeVisible();
});
