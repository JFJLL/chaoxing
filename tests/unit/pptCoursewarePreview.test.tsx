import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PptCoursewarePreview } from "../../src/components/course-workspace/PptCoursewarePreview";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const slides = [
  { title: "第一页 课程导入", bullets: ["要点一", "要点二"], speakerNotes: "第一页讲稿隐藏内容" },
  { title: "第二页 核心概念", bullets: ["概念要点"], speakerNotes: "第二页讲稿" },
  { title: "第三页 总结", bullets: ["总结要点"], speakerNotes: "第三页讲稿" }
];

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("PptCoursewarePreview", () => {
  it("renders a 16:9 read-only preview with a thumbnail per slide and page indicator", () => {
    const markup = renderToStaticMarkup(
      <PptCoursewarePreview title="文化市场营销（PPT）" version={2} slides={slides} sourceLabel="文化市场营销AI课件 · v1" />
    );
    expect(markup).toContain("aspect-video");
    expect(markup).toContain("第一页 课程导入");
    expect(markup).toContain("要点一");
    expect(countOccurrences(markup, "第 1 / 3 页")).toBe(1);
    // One thumbnail button per slide.
    expect(countOccurrences(markup, "第 1 页")).toBeGreaterThanOrEqual(1);
    expect(countOccurrences(markup, "第 3 页")).toBeGreaterThanOrEqual(1);
    expect(markup).toContain("PPT课件 · v2");
    expect(markup).toContain("来源：文化市场营销AI课件 · v1");
    expect(markup).toContain("共3页");
  });

  it("keeps speaker notes collapsed by default and offers no editor controls", () => {
    const markup = renderToStaticMarkup(
      <PptCoursewarePreview title="课件" version={1} slides={slides} />
    );
    expect(markup).toContain("查看教师讲稿备注");
    expect(markup).not.toContain("第一页讲稿隐藏内容");
    expect(markup).not.toContain("新增幻灯片");
    expect(markup).not.toContain(">保存<");
    expect(markup).not.toContain("<textarea");
  });

  it("shows an explicit empty state when there is nothing to preview", () => {
    const markup = renderToStaticMarkup(
      <PptCoursewarePreview title="课件" version={1} slides={[]} />
    );
    expect(markup).toContain("还没有可预览的页面内容");
  });
});
