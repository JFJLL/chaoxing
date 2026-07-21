import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CopilotWorkspace } from "@/components/course-workspace/CopilotWorkspace";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const conversation = {
  id: "conversation-1",
  title: "新对话",
  status: "ACTIVE",
  activeSkill: null,
  attachments: [],
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const skill = {
  id: "skill-1",
  name: "案例分析",
  description: "分析课程案例",
  status: "ENABLED",
  instructions: "教师隐藏指令",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe("CopilotWorkspace", () => {
  it("keeps teacher settings out of the student chat", () => {
    const html = renderToStaticMarkup(<CopilotWorkspace courseId="course-1" canManage={false} initialCopilotName="课程小助手" initialFolderId={null} initialConversations={[conversation]} initialSkills={[skill]} initialFiles={[]} initialFolders={[]} initialAnalytics={null} />);

    expect(html).toContain("未选择 Skill");
    expect(html).toContain("@文件");
    expect(html).toContain("对话仅你可见");
    expect(html).toContain("当前 Skill、文件和最近对话会用于后续回复");
    expect(html).toContain('data-copilot-scroll-region="true"');
    expect(html).not.toContain("Copilot 设置");
    expect(html).not.toContain("教师隐藏指令");
    expect(html).toContain("开始使用课程小助手");
  });

  it("lets a student choose a Skill before a conversation exists", () => {
    const html = renderToStaticMarkup(<CopilotWorkspace courseId="course-1" canManage={false} initialCopilotName="课程小助手" initialFolderId={null} initialConversations={[]} initialSkills={[skill]} initialFiles={[]} initialFolders={[]} initialAnalytics={null} />);

    expect(html).toMatch(/<select(?![^>]*disabled)[^>]*>/);
    expect(html).toContain("案例分析");
  });

  it("offers test and settings modes to course managers", () => {
    const html = renderToStaticMarkup(<CopilotWorkspace courseId="course-1" canManage initialCopilotName="课程小助手" initialFolderId={null} initialConversations={[conversation]} initialSkills={[skill]} initialFiles={[]} initialFolders={[]} initialAnalytics={{ calls: 0, activeUsers: 0, success: 0, failed: 0, skills: [] }} />);

    expect(html).toContain("测试 Copilot");
    expect(html).toContain("Copilot 设置");
  });
});
