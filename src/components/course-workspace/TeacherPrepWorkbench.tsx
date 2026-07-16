import Link from "next/link";
import { ArrowRight, BookOpenCheck, BrainCircuit, ClipboardCheck, Presentation } from "lucide-react";
import { teacherPrepWorkflows, type TeacherPrepWorkflowIcon } from "@/lib/courseWorkspace/capabilities";

const workflowIcons = {
  content: BrainCircuit,
  "lesson-plan": BookOpenCheck,
  assessment: ClipboardCheck,
  courseware: Presentation
} satisfies Record<TeacherPrepWorkflowIcon, typeof BrainCircuit>;

export function TeacherPrepWorkbench({ courseId }: { courseId: string }) {
  return (
    <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-7">
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-xl font-semibold text-slate-950">备课资源与 AI 能力</h1>
        <p className="mt-1 text-sm text-slate-500">选择要完成的备课目标；相关步骤已经合并到同一条流程中。</p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {teacherPrepWorkflows.map((workflow) => {
          const Icon = workflowIcons[workflow.icon];
          return (
            <Link
              key={workflow.id}
              data-workflow-id={workflow.id}
              href={workflow.route(courseId)}
              prefetch
              className="group flex min-h-48 flex-col rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#2165f3] transition group-hover:bg-white">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-950">{workflow.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.description}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4" aria-label={`${workflow.title}包含的步骤`}>
                {workflow.includes.map((item) => (
                  <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-100">{item}</span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
