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
    expect(html).toContain("关联课程");
    expect(html).toContain("保存笔记");
    expect(html).toContain("没有符合条件的笔记");
  });

  it("uses the shared file picker and full-size actions in drive management", () => {
    const html = renderToStaticMarkup(
      <DriveClient
        canManage
        parentId={null}
        breadcrumbs={[]}
        courses={[{ id: "course-1", title: "设计基础" }]}
        files={[{ id: "file-1", name: "课程说明.pdf", kind: "file", size: 1536 }]}
      />
    );

    expect(html).toContain("选择要上传的文件");
    expect(html).toContain("新建文件夹");
    expect(html).toContain("2 KB");
    expect(html).toContain("添加到课程资料");
    expect(html).not.toContain("h-8");
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
