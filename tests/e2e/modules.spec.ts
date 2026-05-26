import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("personal-space secondary modules work through UI flows", async ({ page }) => {
  await loginAs(page, "李素艳");

  await page.goto("/space/topics");
  const topicTitle = `UI 专题 ${Date.now()}`;
  await page.getByPlaceholder("专题或文件夹名称").fill(topicTitle);
  await page.getByPlaceholder("专题内容").fill("UI 创建专题内容");
  await page.getByRole("button", { name: "新建专题" }).click();
  await expect(page.getByText(topicTitle)).toBeVisible();

  await page.goto("/space/inbox");
  const messageSubject = `UI 消息 ${Date.now()}`;
  await page.locator("select").first().selectOption({ label: "学习者" });
  await page.getByPlaceholder("主题").fill(messageSubject);
  await page.getByPlaceholder("内容").fill("UI 消息内容");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByRole("link", { name: "已发送" }).click();
  await expect(page.getByText(messageSubject)).toBeVisible();

  await page.goto("/space/groups");
  const postTitle = `UI 帖子 ${Date.now()}`;
  await page.getByPlaceholder("帖子标题").first().fill(postTitle);
  await page.getByPlaceholder("帖子内容").first().fill("UI 帖子内容");
  await page.getByRole("button", { name: "发布" }).first().click();
  await expect(page.getByText(postTitle)).toBeVisible();

  await page.goto("/space/notes");
  const noteTitle = `UI 笔记 ${Date.now()}`;
  await page.getByPlaceholder("笔记标题").fill(noteTitle);
  await page.getByPlaceholder("标签，逗号分隔").fill("UI,E2E");
  await page.getByPlaceholder("笔记内容").fill("UI 笔记内容");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByPlaceholder("搜索笔记").fill(noteTitle);
  await expect(page.getByText(noteTitle)).toBeVisible();
  await expect(page.getByText(/UI, E2E|UI,E2E/)).toBeVisible();

  await page.goto("/space/contacts");
  await page.getByPlaceholder("搜索姓名、邮箱或单位").fill("学习者");
  await page.getByRole("button", { name: "查看" }).click();
  await page.getByRole("link", { name: "发消息" }).click();
  await expect(page).toHaveURL(/\/space\/inbox\?receiverId=/);

  await page.goto("/space/drive");
  const driveName = `ui-drive-${Date.now()}.md`;
  await page.locator("input[type=file]").setInputFiles({
    name: driveName,
    mimeType: "text/markdown",
    buffer: Buffer.from("云盘 UI 内容")
  });
  await page.getByRole("button", { name: "上传" }).click();
  await expect(page.getByText(driveName)).toBeVisible();
  await page.getByRole("button", { name: "分享" }).first().click();
  await expect(page.getByText(/分享码/)).toBeVisible();
  await page.getByRole("button", { name: "添加到课程资料" }).first().click();

  await page.goto("/space/plagiarism");
  const plagName = `ui-plag-${Date.now()}.md`;
  await page.locator("input[type=file]").setInputFiles({
    name: plagName,
    mimeType: "text/markdown",
    buffer: Buffer.from("活动目标 用户分层 宣传渠道 复盘指标")
  });
  await page.getByRole("button", { name: "提交检测" }).click();
  await expect(page.getByText(plagName)).toBeVisible();
  await expect(page.getByText(/COMPLETED|相似度/).first()).toBeVisible();

  await page.goto("/space/live");
  const liveTitle = `UI 直播 ${Date.now()}`;
  await page.getByPlaceholder("直播标题").fill(liveTitle);
  await page.getByRole("button", { name: "创建直播" }).click();
  await expect(page.getByText(liveTitle)).toBeVisible();
  await page.getByRole("button", { name: "开始" }).first().click();
  await page.getByPlaceholder("聊天消息").first().fill("UI 直播消息");
  await page.getByRole("button", { name: "发送" }).first().click();
  await expect(page.getByText("UI 直播消息")).toBeVisible();
  await page.getByRole("button", { name: "结束" }).first().click();
  await expect(page.getByText("ENDED").first()).toBeVisible();
});

test("students cannot use teacher-only course controls", async ({ page }) => {
  await loginAs(page, "学习者");
  await page.goto("/space/courses");
  await expect(page.getByRole("link", { name: /AI 文档建课/ })).toHaveCount(0);
  await page.getByRole("link", { name: /进入课程/ }).first().click();
  await expect(page.getByRole("link", { name: /AI 文档建课/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /课程建设/ })).toHaveCount(0);
});
