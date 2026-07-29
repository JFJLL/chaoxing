import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() })
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} href={String(href)}>{children}</a>
  )
}));

import { CourseDriveRootSetup } from "@/components/course-workspace/CourseDriveRootSetup";
import { fetchCourseDriveMoveFolders } from "@/components/course-workspace/CourseDriveWorkspace";
import { CourseResourceLibraries } from "@/components/course-workspace/CourseResourceLibraries";
import { CourseResourceUpload } from "@/components/course-workspace/CourseResourceUpload";
import {
  DriveClient,
  driveMutationBasePath,
  MoveDestinationBrowser,
  refreshDriveAfterMutation
} from "@/components/modules/DriveClient";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("course drive UI", () => {
  it("offers create and bind choices when the course has no root", () => {
    const html = renderToStaticMarkup(
      <CourseDriveRootSetup
        courseId="course-1"
        folders={[{ id: "folder-1", name: "已有资料", path: "我的云盘 / 已有资料" }]}
        onReady={vi.fn()}
      />
    );

    expect(html).toContain("创建默认文件夹");
    expect(html).toContain("绑定已有文件夹");
    expect(html).toContain("学生不会看到完整云盘");
  });

  it("renders the three idempotent resource-library entry cards", () => {
    const html = renderToStaticMarkup(<CourseResourceLibraries courseId="course-1" />);

    expect(html).toContain("案例库");
    expect(html).toContain("项目库");
    expect(html).toContain("慕课 / 参考视频");
    expect(html.match(/>创建</g)).toHaveLength(3);
    expect(html).not.toContain("0 项");
  });

  it("presents course upload as one card action without a visible native file control", () => {
    const html = renderToStaticMarkup(<CourseResourceUpload courseId="course-1" folderConfigured />);

    expect(html).toContain("上传课程资料");
    expect(html).toContain("选择并上传");
    expect(html).toContain('class="sr-only"');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("未选择任何文件");
  });

  it("keeps course-drive navigation and moves inside the bound root", () => {
    const html = renderToStaticMarkup(
      <DriveClient
        files={[{ id: "folder-child", parentId: "root-1", name: "课程文档", kind: "folder", size: 0, studentAccess: "DENY" }]}
        folders={[
          { id: "root-1", parentId: null, name: "测试课程" },
          { id: "folder-child", parentId: "root-1", name: "课程文档" }
        ]}
        courses={[{ id: "course-1", title: "测试课程" }]}
        canManage
        courseId="course-1"
        parentId="root-1"
        breadcrumbs={[{ id: "root-1", name: "测试课程" }]}
        baseHref="/space/courses/course-1/drive"
        rootParentId="root-1"
        rootLabel="课程云盘"
      />
    );

    expect(html).toContain('href="/space/courses/course-1/drive?parentId=folder-child"');
    expect(html).toContain(">课程云盘<");
    expect(html).not.toContain("返回上一级");
    expect(html).not.toContain(">我的云盘<");
    expect(html).toContain("更多操作：课程文档");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("学生不可查看/下载 · AI 不可引用");
    expect(html).not.toContain("允许学生查看与 AI 引用");
    expect(html).toContain(">新建文件夹<");
    expect(html).toContain(">上传文件<");
    expect(html).not.toContain("例如：课程课件");
    expect(html).not.toContain("选择要上传的文件");
  });

  it("browses move destinations one folder level at a time instead of flattening every path", () => {
    const folders = [
      { id: "root-1", parentId: null, name: "测试课程" },
      { id: "folder-a", parentId: "root-1", name: "AI产物" },
      { id: "folder-b", parentId: "folder-a", name: "PPT课件" }
    ];
    const rootHtml = renderToStaticMarkup(
      <MoveDestinationBrowser
        folders={folders}
        rootParentId="root-1"
        rootLabel="课程云盘"
        currentParentId="root-1"
        onNavigate={vi.fn()}
      />
    );
    const nestedHtml = renderToStaticMarkup(
      <MoveDestinationBrowser
        folders={folders}
        rootParentId="root-1"
        rootLabel="课程云盘"
        currentParentId="folder-a"
        onNavigate={vi.fn()}
      />
    );

    expect(rootHtml).toContain("打开文件夹 AI产物");
    expect(rootHtml).not.toContain("PPT课件");
    expect(rootHtml).not.toContain("<select");
    expect(nestedHtml).toContain("上一级");
    expect(nestedHtml).toContain("打开文件夹 PPT课件");
    expect(nestedHtml).toContain("目标文件夹路径");
  });

  it("loads the complete course folder hierarchy for the move browser", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        { id: "chapter", name: "第一章", kind: "folder", parentId: "root-1" },
        { id: "lesson", name: "第一节", kind: "folder", parentId: "chapter" },
        { id: "handout", name: "讲义.pdf", kind: "file", parentId: "lesson" }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    try {
      await expect(fetchCourseDriveMoveFolders("course-1")).resolves.toEqual([
        { id: "chapter", name: "第一章", parentId: "root-1" },
        { id: "lesson", name: "第一节", parentId: "chapter" }
      ]);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/courses/course-1/drive-picker",
        { cache: "no-store" }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reloads course-owned children after mutations instead of refreshing stale route props", async () => {
    const reloadCourseChildren = vi.fn().mockResolvedValue(undefined);
    const refreshRoute = vi.fn();

    await refreshDriveAfterMutation(reloadCourseChildren, refreshRoute);

    expect(reloadCourseChildren).toHaveBeenCalledTimes(1);
    expect(refreshRoute).not.toHaveBeenCalled();
  });

  it("routes course-drive mutations through course-scoped authorization", () => {
    expect(driveMutationBasePath("course-1")).toBe("/api/courses/course-1/drive");
    expect(driveMutationBasePath()).toBe("/api/drive");
  });
});
