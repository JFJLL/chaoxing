import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DriveClient } from "@/components/modules/DriveClient";
import { NotesClient } from "@/components/modules/NotesClient";
import { FilePicker } from "@/components/ui/FilePicker";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("module form controls", () => {
  it("gives notes a labeled creation flow and useful empty state", () => {
    const html = renderToStaticMarkup(<NotesClient notes={[]} courses={[{ id: "course-1", title: "设计基础" }]} />);

    expect(html).toContain("搜索标题或正文");
    expect(html).toContain("新建笔记");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("关联课程");
    expect(html).not.toContain("保存笔记");
    expect(html).toContain("没有符合条件的笔记");
  });

  it("uses the shared file picker and full-size actions in drive management", () => {
    const html = renderToStaticMarkup(
      <DriveClient
        canManage
        parentId={null}
        breadcrumbs={[]}
        folders={[]}
        courses={[{ id: "course-1", title: "设计基础" }]}
        files={[{ id: "file-1", name: "课程说明.pdf", kind: "file", size: 1536 }]}
      />
    );

    expect(html).toContain("选择要上传的文件");
    expect(html).toContain("上传期间会显示进度");
    expect(html).toContain("新建文件夹");
    expect(html).toContain("2 KB");
    expect(html).toContain("移动");
    expect(html).toContain("添加到课程资料");
    expect(html).not.toContain("h-8");
  });

  it("makes a folder row an explicit navigation target", () => {
    const html = renderToStaticMarkup(
      <DriveClient
        canManage
        parentId={null}
        breadcrumbs={[]}
        folders={[{ id: "folder-1", name: "课件", parentId: null }]}
        courses={[]}
        files={[{ id: "folder-1", parentId: null, name: "课件", kind: "folder", size: 0 }]}
      />
    );

    expect(html).toContain('href="/space/drive?parentId=folder-1"');
    expect(html).toContain("文件夹 · 点击进入");
  });

  it("returns to the deterministic parent instead of browser history", () => {
    const html = renderToStaticMarkup(
      <DriveClient
        canManage
        parentId="child"
        breadcrumbs={[{ id: "parent", name: "课程资料" }, { id: "child", name: "第一章" }]}
        folders={[]}
        courses={[]}
        files={[]}
      />
    );

    expect(html).toContain("返回上一级");
    expect(html).toContain('href="/space/drive?parentId=parent"');
  });

  it("communicates the selected state without exposing a native file input", () => {
    const html = renderToStaticMarkup(
      <FilePicker id="skill-file" name="file" label="选择 Skill 文件" hint="Markdown 或 ZIP" selectedFileName="lesson-skill.md" />
    );

    expect(html).toContain("lesson-skill.md");
    expect(html).toContain("点击重新选择文件");
    expect(html).toContain("已选择");
    expect(html).toContain('class="peer sr-only"');
  });
});
