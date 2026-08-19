import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI app document source loading (lesson_plan + question_generation)", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/space/courses/[courseId]/ai-workbench/apps/[appType]/page.tsx"),
    "utf8"
  );
  const component = readFileSync(
    join(process.cwd(), "src/components/course-workspace/AiAppGenerator.tsx"),
    "utf8"
  );

  it("loads 资料与章节来源 document rows for both lesson_plan and question_generation", () => {
    expect(page).toContain('appType === "lesson_plan" || appType === "question_generation"');
    // Guard against a regression to a lesson_plan-only loader branch.
    expect(page).not.toMatch(/appType === "lesson_plan"\s*\n\s*\? db\.documentImportJob/);
  });

  it("submits sourceSelections and blocks generation for question_generation", () => {
    expect(component).toContain('(app.appType === "lesson_plan" || app.appType === "question_generation")');
  });

  it("deduplicates document rows by name in the page loader", () => {
    expect(page).toContain("seenDocumentNames");
    expect(page).toContain("uniqueDocumentRows");
  });

  it("renders 资料与章节来源 in a collapsible panel with deduplicated sources", () => {
    expect(component).toContain("uniqueDocumentSources");
    expect(component).toContain("CollapsibleSourcePanel");
    expect(component).toContain('panelId="lesson-source-selection-panel"');
  });
});
