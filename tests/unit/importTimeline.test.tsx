import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("ImportTimeline", () => {
  it("renders the active stage and jobs ahead", () => {
    const html = renderToStaticMarkup(
      <ImportTimeline status="QUEUED" currentStage="等待处理" jobsAhead={2} />
    );

    expect(html).toContain("等待处理");
    expect(html).toContain("前方还有 2 个任务");
    expect(html).toContain("animate-spin");
  });

  it("uses distinct icons for complete, active, and pending steps", () => {
    const html = renderToStaticMarkup(<ImportTimeline status="STRUCTURING" />);

    expect(html.match(/class="lucide lucide-circle-check /g)).toHaveLength(2);
    expect(html.match(/lucide-loader-circle/g)).toHaveLength(1);
    expect(html.match(/class="lucide lucide-circle /g)).toHaveLength(3);
  });

  it("exposes an accessible status for every step", () => {
    const html = renderToStaticMarkup(<ImportTimeline status="STRUCTURING" />);

    expect(html).toContain('aria-label="文档建课进度"');
    expect(html).toContain('aria-label="文档上传：已完成"');
    expect(html).toContain('aria-label="内容解析：已完成"');
    expect(html).toContain('aria-label="目录生成：进行中"');
    expect(html).toContain('aria-label="知识导图：未开始"');
    expect(html).toContain('aria-label="等待确认：未开始"');
    expect(html).toContain('aria-label="已应用：未开始"');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(6);
  });

  it.each([
    [0, "即将开始处理"],
    [1, "前方还有 1 个任务"],
    [null, "等待系统处理"]
  ] as const)("renders the queue label for jobsAhead=%s", (jobsAhead, expectedLabel) => {
    const html = renderToStaticMarkup(<ImportTimeline status="QUEUED" jobsAhead={jobsAhead} />);

    expect(html).toContain(expectedLabel);
  });

  it("renders polling errors as a non-terminal orange notice", () => {
    const html = renderToStaticMarkup(
      <ImportTimeline status="EXTRACTING" currentStage="正在解析文档" pollError="暂时无法获取最新进度" />
    );

    expect(html).toContain("暂时无法获取最新进度");
    expect(html).toContain("text-orange-700");
    expect(html).toContain("内容解析");
    expect(html).toContain("animate-spin");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("导入失败");
  });

  it("renders failed status independently with the backend error", () => {
    const html = renderToStaticMarkup(
      <ImportTimeline
        status="FAILED"
        errorMessage="文档格式无法解析"
        currentStage="内容解析"
        jobsAhead={3}
        pollError="暂时无法获取最新进度"
      />
    );

    expect(html).toContain("lucide-circle-x");
    expect(html).toContain("导入失败");
    expect(html).toContain("文档格式无法解析");
    expect(html).not.toContain("内容解析");
    expect(html).not.toContain("前方还有 3 个任务");
    expect(html).not.toContain("暂时无法获取最新进度");
  });
});
