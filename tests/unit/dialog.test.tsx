import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/components/ui/Dialog";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Dialog", () => {
  it("renders an accessible modal and a named close control", () => {
    const markup = renderToStaticMarkup(<Dialog open title="新建作业" onClose={() => undefined}><p>内容</p></Dialog>);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="关闭"');
    expect(markup).toContain("shrink-0");
  });

  it("renders nothing while closed", () => {
    expect(renderToStaticMarkup(<Dialog open={false} title="隐藏" onClose={() => undefined}><p>内容</p></Dialog>)).toBe("");
  });
});
