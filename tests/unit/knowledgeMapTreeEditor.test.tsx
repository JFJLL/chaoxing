import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeMapTreeEditor } from "@/components/course-workspace/KnowledgeMapTreeEditor";

describe("KnowledgeMapTreeEditor", () => {
  it("keeps outline expand and collapse controls out of global pending feedback", () => {
    const html = renderToStaticMarkup(createElement(KnowledgeMapTreeEditor, {
      nodes: [
        { id: "course", type: "course", label: "课程", order: 0 },
        { id: "document", type: "document", label: "讲义", order: 1 },
        { id: "chapter", type: "chapter", label: "第一章", order: 1 }
      ],
      edges: [
        { id: "course-document", sourceId: "course", targetId: "document", type: "contains" },
        { id: "document-chapter", sourceId: "document", targetId: "chapter", type: "contains" }
      ],
      onSerializedChange: vi.fn(),
      onPreviewChange: vi.fn(),
      onValidityChange: vi.fn()
    }));

    expect(html).toContain('data-cx-no-pending="true" title="收起" aria-label="收起课程：课程"');
    expect(html).toContain('data-cx-no-pending="true" title="展开" aria-label="展开文档：讲义"');
  });
});
