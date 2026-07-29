import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const managerPages = [
  "src/app/space/courses/[courseId]/page.tsx",
  "src/app/space/courses/[courseId]/resources/page.tsx",
  "src/app/space/courses/[courseId]/structure/page.tsx",
  "src/app/space/courses/[courseId]/html-courseware/page.tsx",
  "src/app/space/courses/[courseId]/activities/page.tsx",
  "src/app/space/courses/[courseId]/activities/copilot/page.tsx",
  "src/app/space/courses/[courseId]/activities/tutor/page.tsx",
  "src/app/space/courses/[courseId]/attendance/page.tsx",
  "src/app/space/courses/[courseId]/assignments/page.tsx",
  "src/app/space/courses/[courseId]/assignments/new/page.tsx",
  "src/app/space/courses/[courseId]/assignments/[assignmentId]/page.tsx",
  "src/app/space/courses/[courseId]/exams/page.tsx",
  "src/app/space/courses/[courseId]/exams/new/page.tsx",
  "src/app/space/courses/[courseId]/exams/[examId]/page.tsx",
  "src/app/space/courses/[courseId]/notices/page.tsx",
  "src/app/space/courses/[courseId]/question-bank/page.tsx",
  "src/app/space/courses/[courseId]/analytics/page.tsx",
  "src/app/space/courses/[courseId]/after-class/page.tsx"
];

const managerMutationRoutes = [
  "src/app/api/courses/[courseId]/attendance/route.ts",
  "src/app/api/courses/[courseId]/attendance/[sessionId]/route.ts",
  "src/app/api/courses/[courseId]/attendance/[sessionId]/token/route.ts",
  "src/app/api/courses/[courseId]/assignments/route.ts",
  "src/app/api/courses/[courseId]/assignments/[assignmentId]/route.ts",
  "src/app/api/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]/grade/route.ts",
  "src/app/api/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]/return/route.ts",
  "src/app/api/courses/[courseId]/exams/route.ts",
  "src/app/api/courses/[courseId]/exams/[examId]/route.ts",
  "src/app/api/courses/[courseId]/exams/[examId]/attempts/[attemptId]/grade/route.ts",
  "src/app/api/courses/[courseId]/notices/route.ts",
  "src/app/api/courses/[courseId]/notices/[noticeId]/route.ts",
  "src/app/api/courses/[courseId]/question-bank/[questionId]/route.ts"
];

describe("collaborator course management surface", () => {
  it("uses the shared manager predicate throughout classroom and after-class pages", () => {
    for (const path of managerPages) {
      const source = read(path);
      expect(source, path).toContain("isCourseManagerRecord");
      expect(source, path).not.toMatch(/course\.ownerId\s*===\s*user\.id/);
    }
  });

  it("keeps every teacher mutation route behind requireCourseManager", () => {
    for (const path of managerMutationRoutes) {
      expect(read(path), path).toContain("requireCourseManager");
    }
  });

  it("lets collaborators enter the course drive and receive manager navigation", () => {
    const drivePage = read("src/app/space/courses/[courseId]/drive/page.tsx");
    const shell = read("src/components/course-workspace/FanyaCourseShell.tsx");

    expect(drivePage).toContain("requireCourseManager");
    expect(drivePage).not.toContain("requireCourseOwner");
    expect(shell).toContain("isCourseManagerRecord");
    expect(shell).not.toMatch(/course\.ownerId\s*===\s*user\.id/);
  });

  it("keeps legacy HTML courseware away from students and redirects the old manager structure entry", () => {
    const htmlCourseware = read("src/app/space/courses/[courseId]/html-courseware/page.tsx");
    const structure = read("src/app/space/courses/[courseId]/structure/page.tsx");

    expect(htmlCourseware).toContain("if (!canManage) redirect");
    expect(structure).toContain("if (canManage) redirect(`/space/courses/${courseId}/ai-workbench/content`)");
    expect(structure).not.toContain("导入课程文档");
    expect(structure).not.toContain("AI 文档建课");
  });

  it("keeps student actions and analytics scoped to CourseEnrollment", () => {
    const studentRoutes = [
      "src/app/api/courses/[courseId]/attendance/[sessionId]/check-in/route.ts",
      "src/app/api/courses/[courseId]/assignments/[assignmentId]/submission/route.ts",
      "src/app/api/courses/[courseId]/exams/[examId]/attempt/route.ts",
      "src/app/api/courses/[courseId]/notices/[noticeId]/read/route.ts"
    ];
    for (const path of studentRoutes) {
      expect(read(path), path).toContain("courseEnrollment");
      expect(read(path), path).not.toContain("courseCollaborator");
    }

    const analytics = read("src/app/space/courses/[courseId]/analytics/page.tsx");
    expect(analytics).toContain("course.enrollments.map");
    expect(analytics).not.toContain("course.collaborators.map");
  });
});
