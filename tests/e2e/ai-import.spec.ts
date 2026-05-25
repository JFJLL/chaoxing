import { expect, test } from "@playwright/test";
import { firstTaughtCourseId, loginAs } from "./helpers";

test("teacher uploads a document, reviews generated outline, and applies it", async ({ page }) => {
  await loginAs(page, "李素艳");
  const courseId = await firstTaughtCourseId(page);
  await page.goto(`/space/courses/${courseId}/ai-import`);
  await page.locator("input[type=file]").setInputFiles({
    name: "e2e-course.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 数字阅读服务培训\n\n## 服务认知\n读者需求。\n\n## 活动策划\n复盘指标。\n\n## 数据分析\n反馈改进。")
  });
  await page.getByRole("button", { name: /开始生成目录/ }).click();
  await expect(page.getByText("等待确认").first()).toBeVisible();
  await page.getByRole("button", { name: /应用到课程/ }).click();
  await expect(page).toHaveURL(new RegExp(`/space/courses/${courseId}/builder`));
  const values = await page.locator("input").evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value));
  expect(values.some((value) => /数字阅读服务培训|服务认知/.test(value))).toBe(true);
});
