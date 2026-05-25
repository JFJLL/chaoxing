import { expect, test } from "@playwright/test";
import { firstTaughtCourseId, loginAs } from "./helpers";

test("personal-space secondary modules have working local flows", async ({ page }) => {
  await loginAs(page, "李素艳");
  const result = await page.evaluate(async () => {
    const json = async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
      return { ok: response.ok, body: await response.json().catch(() => null) };
    };
    const contacts = await json("/api/contacts");
    const student = contacts.body.contacts.find((contact: { name: string }) => contact.name === "学习者");
    const courses = await json("/api/courses?tab=taught");
    const course = courses.body.courses[0];
    const invite = await json("/api/invite", { method: "POST", body: JSON.stringify({ code: "GROUP2026" }) });
    const topic = await json("/api/topics", { method: "POST", body: JSON.stringify({ type: "topic", title: "E2E 专题", description: "内容" }) });
    const inbox = await json("/api/inbox", { method: "POST", body: JSON.stringify({ receiverId: student.id, subject: "E2E 消息", body: "内容" }) });
    const groups = await json("/api/groups");
    const group = groups.body.groups[0];
    const post = await json(`/api/groups/${group.id}/posts`, { method: "POST", body: JSON.stringify({ title: "E2E 帖子", body: "内容" }) });
    const comment = await json(`/api/groups/${group.id}/posts`, { method: "POST", body: JSON.stringify({ postId: post.body.post.id, body: "评论" }) });
    const note = await json("/api/notes", { method: "POST", body: JSON.stringify({ title: "E2E 笔记", body: "内容", tags: ["E2E"], courseId: course.id }) });
    const driveForm = new FormData();
    driveForm.set("file", new File(["云盘内容"], "e2e-drive.md", { type: "text/markdown" }));
    const driveUpload = await fetch("/api/drive", { method: "POST", body: driveForm });
    const driveBody = await driveUpload.json();
    const share = await json(`/api/drive/${driveBody.file.id}/share`, { method: "POST", body: "{}" });
    const attach = await json("/api/drive", { method: "POST", body: JSON.stringify({ driveFileId: driveBody.file.id, courseId: course.id }) });
    const plagForm = new FormData();
    plagForm.set("file", new File(["活动目标 用户分层 宣传渠道 复盘指标"], "e2e-plag.md", { type: "text/markdown" }));
    const plag = await fetch("/api/plagiarism", { method: "POST", body: plagForm });
    const plagBody = await plag.json();
    const live = await json("/api/live", { method: "POST", body: JSON.stringify({ title: "E2E 直播" }) });
    const start = await json(`/api/live/${live.body.session.id}`, { method: "PUT", body: JSON.stringify({ action: "start" }) });
    const chat = await json(`/api/live/${live.body.session.id}/chat`, { method: "POST", body: JSON.stringify({ body: "消息" }) });
    const end = await json(`/api/live/${live.body.session.id}`, { method: "PUT", body: JSON.stringify({ action: "end" }) });
    return {
      invite: invite.ok,
      topic: topic.ok,
      inbox: inbox.ok,
      group: post.ok && comment.ok,
      note: note.ok,
      contacts: contacts.ok && !!student,
      drive: driveUpload.ok && share.ok && attach.ok,
      plagiarism: plag.ok && plagBody.check.status === "COMPLETED",
      live: live.ok && start.ok && chat.ok && end.ok
    };
  });
  expect(result).toEqual({
    invite: true,
    topic: true,
    inbox: true,
    group: true,
    note: true,
    contacts: true,
    drive: true,
    plagiarism: true,
    live: true
  });

  const courseId = await firstTaughtCourseId(page);
  expect(courseId).toBeTruthy();
});
