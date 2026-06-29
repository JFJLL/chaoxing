import { expect, test } from "@playwright/test";
import { firstTaughtCourseId, loginAs } from "./helpers";

test("teacher uploads a document, publishes map and HTML courseware, then applies outline", async ({ page }) => {
  await loginAs(page, "李素艳");
  const courseId = await firstTaughtCourseId(page);
  await page.goto(`/space/courses/${courseId}/ai-import`);
  await page.locator("input[type=file]").setInputFiles({
    name: "e2e-course.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 数字阅读服务培训\n\n## 服务认知\n读者需求。\n\n## 活动策划\n复盘指标。\n\n## 数据分析\n反馈改进。")
  });
  await page.getByRole("button", { name: /提交解析任务/ }).click();
  await page.waitForURL(new RegExp(`/space/courses/${courseId}/ai-import/.+`));
  const jobId = page.url().split("/").pop();
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/ai-import/${id}`);
      const body = await response.json();
      return body.job?.status === "READY_FOR_REVIEW";
    },
    jobId,
    { timeout: 15000 }
  );
  await page.reload();
  await expect(page.getByText("等待确认").first()).toBeVisible();
  await expect(page.getByText(/个节点/)).toBeVisible();

  await page.getByRole("button", { name: "发布导图" }).click();
  await expect(page.getByRole("button", { name: "导图已发布" })).toBeVisible();
  await page.getByRole("button", { name: "生成HTML课件" }).click();
  await expect(page.getByRole("button", { name: "发布课件" })).toBeVisible();
  await page.getByRole("button", { name: "发布课件" }).click();
  await expect(page.getByRole("link", { name: "播放课件" })).toBeVisible();

  await page.getByRole("button", { name: /应用到课程/ }).click();
  await expect(page).toHaveURL(new RegExp(`/space/courses/${courseId}/builder`));
  const values = await page.locator("input").evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value));
  expect(values.some((value) => /数字阅读服务培训|服务认知/.test(value))).toBe(true);

  await page.context().clearCookies();
  await loginAs(page, "学习者");
  await page.goto(`/space/courses/${courseId}/knowledge-map`);
  await expect(page.getByRole("heading", { name: "知识导图", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "课程知识导图" })).toBeVisible();
  await expect(page.getByText(/个节点/).first()).toBeVisible();
  await page.goto(`/space/courses/${courseId}/html-courseware`);
  await expect(page.getByRole("heading", { name: "HTML课件", exact: true })).toBeVisible();
  await expect(page.frameLocator("iframe").getByText(/1 \/ \d+/)).toBeVisible();
});

test("student cannot call teacher import and generation APIs", async ({ page }) => {
  await loginAs(page, "李素艳");
  const courseId = await firstTaughtCourseId(page);
  await page.context().clearCookies();
  await loginAs(page, "学习者");

  const statuses = await page.evaluate(async (id) => {
    const formData = new FormData();
    formData.set("file", new File(["# 学生上传"], "student.md", { type: "text/markdown" }));
    const [list, upload, html] = await Promise.all([
      fetch(`/api/courses/${id}/ai-import`),
      fetch(`/api/courses/${id}/ai-import`, { method: "POST", body: formData }),
      fetch(`/api/courses/${id}/html-courseware`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapId: "map-from-student" })
      })
    ]);
    return { list: list.status, upload: upload.status, html: html.status };
  }, courseId);

  expect(statuses).toEqual({ list: 403, upload: 403, html: 403 });
});
