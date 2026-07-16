import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  ClipboardCheck,
  FileInput,
  FileText,
  FolderOpen,
  MessageCircle,
  Network,
  Presentation,
  Sparkles
} from "lucide-react";
import { courseCapabilities, type CourseCapabilityGroup, type CourseCapabilityIcon } from "@/lib/courseWorkspace/capabilities";

const groupMeta: Array<{ id: CourseCapabilityGroup; title: string; description: string }> = [
  { id: "create", title: "创建教学内容", description: "从课程资料出发，直接进入需要完成的生成任务。" },
  { id: "manage", title: "管理备课成果", description: "查看课程资料、知识关系和已经发布的互动成果。" },
  { id: "support", title: "教学支持", description: "在确定的独立页面中使用课程 AI 助教。" }
];

const capabilityIcons = {
  "document-import": FileInput,
  "lesson-plan": BookOpenCheck,
  "question-generation": Sparkles,
  "paper-assembly": ClipboardCheck,
  courseware: Presentation,
  "interactive-courseware": FileText,
  resources: FolderOpen,
  "knowledge-map": Network,
  "published-courseware": Presentation,
  tutor: MessageCircle
} satisfies Record<CourseCapabilityIcon, typeof Bot>;

export type PrepWorkItem = {
  id: string;
  title: string;
  status: string;
  detail: string;
  href: string;
  updatedAt: string;
  tone: "blue" | "orange" | "red" | "slate";
};

const taskTones = {
  blue: "bg-blue-50 text-blue-700",
  orange: "bg-orange-50 text-orange-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600"
};

export function TeacherPrepWorkbench({ courseId, workItems }: { courseId: string; workItems: PrepWorkItem[] }) {
  const capabilities = courseCapabilities.filter((capability) => capability.enabled && capability.audience.includes("teacher"));

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-7">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-5">
          <h2 className="text-xl font-semibold text-slate-950">继续处理</h2>
          <p className="text-sm text-slate-500">优先回到待确认、生成中或需要修复的备课任务。</p>
        </div>
        {workItems.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {workItems.map((item) => (
              <Link key={item.id} href={item.href} className="group flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${taskTones[item.tone]}`}>{item.status}</span>
                  <h3 className="mt-3 line-clamp-1 font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.detail}</p>
                  <p className="mt-2 text-xs text-slate-400">更新于 {new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
            <p className="font-medium text-slate-800">当前没有待处理任务</p>
            <p className="mt-1 text-sm text-slate-500">从下方选择一个教学目标开始创建，生成后的草稿会回到这里。</p>
          </div>
        )}
      </section>

      {groupMeta.map((group) => {
        const groupCapabilities = capabilities.filter((capability) => capability.group === group.id);
        if (!groupCapabilities.length) return null;
        return (
          <section key={group.id} className="rounded-[28px] bg-white p-6 shadow-sm lg:p-7">
            <div className="border-b border-slate-100 pb-5">
              <h2 className="text-xl font-semibold text-slate-950">{group.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{group.description}</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupCapabilities.map((capability) => {
                const Icon = capabilityIcons[capability.icon];
                return (
                  <Link
                    key={capability.id}
                    data-capability-id={capability.id}
                    href={capability.route(courseId)}
                    className="group rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:border-blue-200 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#2165f3] transition group-hover:bg-white">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-950">{capability.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{capability.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
