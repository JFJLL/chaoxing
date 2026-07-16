import Link from "next/link";
import { clsx } from "clsx";

export type PrepWorkflow = "content" | "assessment" | "courseware";

const workflowSteps = {
  content: [
    { id: "import", label: "导入课程文档", route: (courseId: string) => `/space/courses/${courseId}/ai-workbench/content` },
    { id: "resources", label: "课程资料", route: (courseId: string) => `/space/courses/${courseId}/resources` },
    { id: "knowledge-map", label: "知识图谱", route: (courseId: string) => `/space/courses/${courseId}/knowledge-map` }
  ],
  assessment: [
    { id: "questions", label: "生成题目", route: (courseId: string) => `/space/courses/${courseId}/ai-workbench/apps/question_generation` },
    { id: "question-bank", label: "审核题库", route: (courseId: string) => `/space/courses/${courseId}/question-bank` },
    { id: "paper", label: "智能组卷", route: (courseId: string) => `/space/courses/${courseId}/ai-workbench/apps/paper_assembly` }
  ],
  courseware: [
    { id: "courseware", label: "生成课件", route: (courseId: string) => `/space/courses/${courseId}/ai-workbench/apps/courseware` },
    { id: "interactive", label: "制作互动版", route: (courseId: string) => `/space/courses/${courseId}/ai-workbench/apps/html_courseware` },
    { id: "published", label: "已发布课件", route: (courseId: string) => `/space/courses/${courseId}/html-courseware` }
  ]
} as const;

export function PrepWorkflowNavigation({
  courseId,
  workflow,
  active
}: {
  courseId: string;
  workflow: PrepWorkflow;
  active: string;
}) {
  return (
    <nav aria-label="备课流程" className="flex max-w-full flex-wrap gap-2">
      {workflowSteps[workflow].map((step) => {
        const selected = step.id === active;
        return (
          <Link
            key={step.id}
            href={step.route(courseId)}
            prefetch
            aria-current={selected ? "step" : undefined}
            className={clsx(
              "rounded-full px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              selected ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            )}
          >
            {step.label}
          </Link>
        );
      })}
    </nav>
  );
}
