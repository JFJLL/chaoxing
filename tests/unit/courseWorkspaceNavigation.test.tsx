import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/space" }));
vi.mock("next/link", () => ({
  default: ({ children, prefetch: _prefetch, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} href={href} data-next-link="true">{children}</a>
  )
}));
import { CourseWorkspaceSidebar } from "../../src/components/course-workspace/CourseWorkspaceSidebar";
import { PrepWorkflowNavigation } from "../../src/components/course-workspace/PrepWorkflowNavigation";
import { getCourseWorkspaceNavParent } from "../../src/lib/courseWorkspace/nav";
import { UserMenu } from "../../src/components/shell/UserMenu";
import { SpaceSidebar } from "../../src/components/shell/SpaceSidebar";
import { SpaceHeader } from "../../src/components/shell/SpaceHeader";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("course workspace navigation", () => {
  it.each(["resources", "knowledge-map", "html-courseware", "structure"] as const)(
    "keeps %s under the prep center parent",
    (tab) => {
      expect(getCourseWorkspaceNavParent(tab)).toBe("ai-workbench");
    }
  );

  it("keeps the legacy pre-class redirect under the after-class parent", () => {
    expect(getCourseWorkspaceNavParent("pre-class")).toBe("after-class");
    expect(getCourseWorkspaceNavParent("question-bank")).toBe("after-class");
  });

  it("highlights the prep center for a child route and removes fake course links", () => {
    const html = renderToStaticMarkup(
      <CourseWorkspaceSidebar
        course={{ id: "course-1", title: "测试课程" }}
        activeTab="resources"
        canManage
      />
    );

    expect(html).toMatch(/<a(?=[^>]*href="\/space\/courses\/course-1\/ai-workbench")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="课程工作区导航"');
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("课程门户");
    expect(html).not.toContain(">链接<");
  });

  it("uses document navigation for primary course sections", () => {
    const html = renderToStaticMarkup(
      <CourseWorkspaceSidebar
        course={{ id: "course-1", title: "测试课程" }}
        activeTab="activities"
        canManage
      />
    );

    expect(html).not.toContain('data-next-link="true"');
    expect(html).toContain('href="/space/courses/course-1/after-class"');
    expect(html).toContain('href="/space/courses/course-1/analytics"');
    expect(html.match(/from-\[#5669c9\] to-\[#8b6de0\] text-white shadow-sm/g)).toHaveLength(1);
  });

  it("removes the invite-code shortcut from both role variants", () => {
    for (const role of ["TEACHER", "STUDENT"] as const) {
      const html = renderToStaticMarkup(
        <SpaceHeader user={{ id: `${role.toLowerCase()}-1`, name: "测试用户", role, institutionId: "institution-1" }} institutionName="测试学校" />
      );
      expect(html).toContain("资源发现");
      expect(html).not.toContain("输入邀请码");
      expect(html).not.toContain('action="/api/invite"');
    }
  });

  it("uses task steps instead of a file-path breadcrumb for prep workflows", () => {
    const html = renderToStaticMarkup(
      <PrepWorkflowNavigation courseId="course-1" workflow="assessment" active="paper" />
    );

    expect(html).toContain('aria-label="备课流程"');
    expect(html).toContain('href="/space/courses/course-1/ai-workbench/apps/question_generation"');
    expect(html).toContain('href="/space/courses/course-1/question-bank"');
    expect(html).toContain('href="/space/courses/course-1/ai-workbench/apps/paper_assembly"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("智能组卷");
    expect(html).not.toContain("面包屑");
  });

  it("keeps the primary content task inside the shared AI workbench layout", () => {
    const html = renderToStaticMarkup(
      <PrepWorkflowNavigation courseId="course-1" workflow="content" active="import" />
    );

    expect(html).toContain('href="/space/courses/course-1/ai-workbench/content"');
    expect(html).not.toContain('href="/space/courses/course-1/ai-import"');
  });

  it("does not expose account actions that have no implementation", () => {
    const html = renderToStaticMarkup(
      <UserMenu user={{ id: "teacher-1", name: "李老师", role: "TEACHER", institutionId: "institution-1" }} />
    );

    expect(html).toContain("退出空间");
    expect(html).not.toContain("账号管理");
    expect(html).not.toContain("切换单位/角色");
  });

  it("moves Zovii from the global space into every course sidebar", () => {
    const courseHtml = renderToStaticMarkup(
      <CourseWorkspaceSidebar course={{ id: "course-1", title: "测试课程" }} activeTab="activities" canManage />
    );
    const spaceHtml = renderToStaticMarkup(
      <SpaceSidebar user={{ id: "teacher-1", name: "李老师", role: "TEACHER", institutionId: "institution-1" }} />
    );

    expect(courseHtml).toContain('href="https://zovii.studio/"');
    expect(courseHtml).toContain("zovii智能画布");
    expect(courseHtml).toContain('target="_blank"');
    expect(courseHtml).toContain("bg-slate-100 text-slate-500");
    expect(courseHtml).not.toContain("lucide-external-link");
    expect(courseHtml).not.toContain("from-fuchsia-500");
    expect(courseHtml).toContain("cx-hide-scrollbar");
    expect(spaceHtml).not.toContain("zovii.studio");
    expect(spaceHtml).not.toContain("生图");
  });

  it("uses the original blue surface for the global space sidebar", () => {
    const html = renderToStaticMarkup(
      <SpaceSidebar user={{ id: "teacher-1", name: "李老师", role: "TEACHER", institutionId: "institution-1" }} />
    );

    expect(html).toContain("bg-[var(--cx-blue)]");
    expect(html).not.toContain("linear-gradient(180deg");
  });
});
