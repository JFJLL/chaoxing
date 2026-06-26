import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

async function openFirstTaughtCourse(page: Parameters<typeof loginAs>[0]) {
  await page.goto("/space/courses?tab=taught");
  await page.getByRole("link", { name: "进入课程" }).first().click();
  await expect(page).toHaveURL(/\/space\/courses\/.+\/ai-workbench/);
}

test("course card opens Fanya workspace with full sidebar", async ({ page }) => {
  await loginAs(page, "李素艳");
  await openFirstTaughtCourse(page);

  await expect(page.getByText("易美")).toBeVisible();
  await expect(page.getByText("李素艳").last()).toBeVisible();
  await expect(page.getByRole("link", { name: "返回课程列表" })).toBeVisible();
  for (const label of ["AI工作台", "班级活动", "课程结构", "课程资料库", "通知", "讨论", "作业", "考试", "题库"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  for (const label of ["课件", "教案", "资料"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }
  await page.getByRole("link", { name: "返回课程列表" }).click();
  await expect(page).toHaveURL(/\/space\/courses\?tab=taught/);
});

test("AI application tab shows requested app cards", async ({ page }) => {
  await loginAs(page, "李素艳");
  await openFirstTaughtCourse(page);

  await expect(page.getByRole("button", { name: "AI应用", exact: true })).toHaveClass(/text-white/);
  for (const label of ["全部应用", "备课中心", "教学神器", "学习助手", "资料科研"]) {
    await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible();
  }
  for (const label of ["AI出题", "AI教案", "AI课件", "AI组卷"]) {
    await expect(page.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
});

test("AI assistant practice and analytics tabs render local course data", async ({ page }) => {
  await loginAs(page, "李素艳");
  await openFirstTaughtCourse(page);

  await page.getByRole("button", { name: "AI助教", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI助教" })).toBeVisible();
  await expect(page.getByText("课程问答助手")).toBeVisible();
  await expect(page.getByText("课程上下文")).toBeVisible();

  await page.getByRole("button", { name: "AI实践", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI实践" })).toBeVisible();
  await expect(page.getByText("实践任务板")).toBeVisible();
  await expect(page.getByRole("link", { name: "去 AI出题" })).toBeVisible();

  await page.getByRole("button", { name: "AI学情分析", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI学情分析" })).toBeVisible();
  await expect(page.getByText("AI 产物分布")).toBeVisible();
  await expect(page.getByText("最近生成")).toBeVisible();
});

for (const app of [
  { label: "AI出题", preview: "答案：" },
  { label: "AI教案", preview: "教学目标" },
  { label: "AI课件", preview: "Slide 1" },
  { label: "AI组卷", preview: "阶段测验" }
]) {
  test(`${app.label} generates and persists artifact`, async ({ page }) => {
    await loginAs(page, "李素艳");
    await openFirstTaughtCourse(page);

    await page.getByRole("link", { name: new RegExp(app.label) }).click();
    const prompt = `${app.label}-${Date.now().toString().slice(-5)}`;
    await page.getByLabel("生成要求").fill(prompt);
    const responsePromise = page.waitForResponse((response) => response.url().includes(`/api/courses/`) && response.url().includes(`/ai-apps`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "生成", exact: true }).click();
    await expect.poll(async () => (await responsePromise).status()).toBe(201);
    await expect(page.getByText(prompt).first()).toBeVisible();
    await expect(page.getByText(app.preview).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(prompt).first()).toBeVisible();
  });
}

test("course sidebar tabs route and update active state", async ({ page }) => {
  await loginAs(page, "李素艳");
  await openFirstTaughtCourse(page);

  const tabs = [
    { label: "AI工作台", path: "ai-workbench", heading: "AI应用" },
    { label: "班级活动", path: "activities", heading: "班级活动" },
    { label: "课程结构", path: "structure", heading: "课程结构" },
    { label: "课程资料库", path: "resources", heading: "课程资料库" },
    { label: "通知", path: "notices", heading: "通知" },
    { label: "讨论", path: "discussions", heading: "讨论" },
    { label: "作业", path: "assignments", heading: "作业" },
    { label: "考试", path: "exams", heading: "考试" },
    { label: "题库", path: "question-bank", heading: "题库" }
  ];

  for (const tab of tabs) {
    await page.getByRole("link", { name: tab.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/space/courses/.+/${tab.path}`));
    await expect(page.getByRole("link", { name: tab.label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(tab.heading).first()).toBeVisible();
  }

  await page.getByRole("link", { name: "课程资料库", exact: true }).click();
  for (const label of ["课件资料", "案例库", "项目库", "知网接口", "其他资料"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByText(label).first()).toBeVisible();
  }
});
