import { describe, expect, it } from "vitest";
import { teacherPrepWorkflows } from "@/lib/courseWorkspace/capabilities";
import { getTeacherPrepWorkflowOnboardingTarget } from "@/components/course-workspace/TeacherPrepWorkbench";

describe("TeacherPrepWorkbench onboarding anchor", () => {
  it("maps the real course-content workflow card to the third guide target", () => {
    const workflow = teacherPrepWorkflows.find((item) => item.id === "course-content");
    expect(workflow).toBeDefined();
    expect(getTeacherPrepWorkflowOnboardingTarget(workflow!.id)).toBe("start-document-import");
  });

  it("does not attach the third-step anchor to unrelated workflow cards", () => {
    expect(getTeacherPrepWorkflowOnboardingTarget("courseware")).toBeUndefined();
  });
});
