"use client";

import { useMemo, useState } from "react";
import { BarChart3, BookOpenCheck, ClipboardCheck, GraduationCap, Search, Sparkles, Target } from "lucide-react";
import { clsx } from "clsx";
import { AiAppGrid } from "@/components/course-workspace/AiAppGrid";
import { courseAiApps } from "@/lib/courseWorkspace/aiApps";
import { AiCourseSearch } from "@/components/course-workspace/AiCourseSearch";
import { AiTutor, type TutorConversationDto } from "@/components/course-workspace/AiTutor";

const topTabs = ["AI助教", "AI应用", "AI实践", "AI学情分析"] as const;
const categories = ["全部备课工具", "备课中心", "教学神器"] as const;
const prepToolTitles = new Set(["AI教案", "AI课件", "HTML课件", "AI出题"]);

export type AiWorkbenchContext = {
  courseTitle: string;
  chapterCount: number;
  lessonCount: number;
  resourceCount: number;
  studentCount: number;
  announcementCount: number;
  artifactCounts: {
    questionGeneration: number;
    lessonPlan: number;
    courseware: number;
    paperAssembly: number;
    htmlCourseware: number;
  };
  chapters: Array<{ title: string; lessonCount: number }>;
  recentArtifacts: Array<{ id: string; title: string; appType: string; createdAt: string }>;
};

function AiPracticePanel({ courseId, context }: { courseId: string; context: AiWorkbenchContext }) {
  const practices = [
    { title: "课堂练习", description: "从 AI出题生成的题目中选择 5 道，形成课中练习。", action: "去 AI出题", href: `/space/courses/${courseId}/ai-workbench/apps/question_generation` },
    { title: "分组研讨", description: "基于章节主题生成案例讨论任务和评价标准。", action: "生成教案", href: `/space/courses/${courseId}/ai-workbench/apps/lesson_plan` },
    { title: "阶段测验", description: "按知识点、题型和分值生成测验卷。", action: "去 AI组卷", href: `/space/courses/${courseId}/ai-workbench/apps/paper_assembly` }
  ];

  return (
    <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-7">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
        <h2 className="text-xl font-semibold text-slate-950">AI实践</h2>
        <p className="text-sm text-slate-500">把 AI 生成内容落到课堂练习、分组活动和阶段测验。</p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {practices.map((practice) => (
          <article key={practice.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <Target className="h-7 w-7 text-[#2165f3]" />
            <h3 className="mt-4 font-semibold text-slate-950">{practice.title}</h3>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{practice.description}</p>
            <a href={practice.href} className="mt-4 inline-flex h-9 items-center rounded-full bg-[#2165f3] px-4 text-sm font-medium text-white">
              {practice.action}
            </a>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-slate-950">实践任务板</h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            `已生成题目批次 ${context.artifactCounts.questionGeneration}`,
            `可用教案 ${context.artifactCounts.lessonPlan}`,
            `可用测验卷 ${context.artifactCounts.paperAssembly}`
          ].map((item) => (
            <div key={item} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{item}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AiLearningAnalyticsPanel({ context }: { context: AiWorkbenchContext }) {
  const totalArtifacts =
    context.artifactCounts.questionGeneration +
    context.artifactCounts.lessonPlan +
    context.artifactCounts.courseware +
    context.artifactCounts.paperAssembly +
    context.artifactCounts.htmlCourseware;
  const metrics = [
    { label: "学生数", value: context.studentCount, icon: GraduationCap },
    { label: "章节数", value: context.chapterCount, icon: BookOpenCheck },
    { label: "课时数", value: context.lessonCount, icon: ClipboardCheck },
    { label: "AI产物", value: totalArtifacts, icon: Sparkles }
  ];

  return (
    <section className="rounded-[28px] bg-white p-6 shadow-sm lg:p-7">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
        <h2 className="text-xl font-semibold text-slate-950">AI学情分析</h2>
        <p className="text-sm text-slate-500">基于课程结构、资源和 AI 产物生成本地学情概览。</p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <Icon className="h-6 w-6 text-[#2165f3]" />
              <p className="mt-4 text-sm text-slate-500">{metric.label}</p>
              <p className="mt-1 text-3xl font-semibold text-slate-950">{metric.value}</p>
            </article>
          );
        })}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#2165f3]" />
            <h3 className="font-semibold text-slate-950">AI 产物分布</h3>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["AI出题", context.artifactCounts.questionGeneration],
              ["AI教案", context.artifactCounts.lessonPlan],
              ["AI课件", context.artifactCounts.courseware],
              ["AI组卷", context.artifactCounts.paperAssembly],
              ["HTML课件", context.artifactCounts.htmlCourseware]
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)_36px] items-center gap-3 text-sm">
                <span className="text-slate-600">{label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#2165f3]" style={{ width: `${Math.max(8, Math.min(100, Number(value) * 18))}%` }} />
                </div>
                <span className="text-right font-medium text-slate-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-2xl border border-slate-100 p-5">
          <h3 className="font-semibold text-slate-950">最近生成</h3>
          <div className="mt-4 space-y-3">
            {context.recentArtifacts.slice(0, 5).map((artifact) => (
              <div key={artifact.id} className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="line-clamp-1 text-sm font-medium text-slate-800">{artifact.title}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(artifact.createdAt).toLocaleString("zh-CN", { hour12: false })}</p>
              </div>
            ))}
            {!context.recentArtifacts.length ? <p className="text-sm text-slate-500">暂无 AI 产物。</p> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function AiWorkbench({ courseId, context, canManage = false, initialTutorConversations = [] }: { courseId: string; context: AiWorkbenchContext; canManage?: boolean; initialTutorConversations?: TutorConversationDto[] }) {
  const visibleTopTabs = canManage ? topTabs : topTabs.filter((tab) => tab === "AI助教" || tab === "AI学情分析");
  const [topTab, setTopTab] = useState<(typeof topTabs)[number]>(canManage ? "AI应用" : "AI助教");
  const [category, setCategory] = useState<(typeof categories)[number]>("全部备课工具");
  const [keyword, setKeyword] = useState("");

  const apps = useMemo(
    () =>
      courseAiApps.filter((app) => {
        if (!prepToolTitles.has(app.title)) return false;
        const matchCategory = category === "全部备课工具" || app.category === category;
        const matchKeyword = !keyword || app.title.includes(keyword) || app.description.includes(keyword);
        return matchCategory && matchKeyword;
      }),
    [category, keyword]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-full bg-white p-1 shadow-sm">
          {visibleTopTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTopTab(tab)}
              className={clsx(
                "h-10 rounded-full px-5 text-sm font-medium transition",
                topTab === tab ? "bg-[#2165f3] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <AiCourseSearch courseId={courseId} />
      </div>

      {topTab === "AI助教" ? <AiTutor courseId={courseId} courseTitle={context.courseTitle} initialConversations={initialTutorConversations} /> : null}
      {canManage && topTab === "AI实践" ? <AiPracticePanel courseId={courseId} context={context} /> : null}
      {topTab === "AI学情分析" ? <AiLearningAnalyticsPanel context={context} /> : null}
      {canManage && topTab === "AI应用" ? (
        <section className="rounded-[28px] bg-white p-5 shadow-sm lg:p-7">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">备课 AI 工具</h2>
              <p className="mt-1 text-sm text-slate-500">围绕教案、课件、互动课件和练习题组织常用 AI 能力。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={clsx(
                    "h-9 rounded-full px-4 text-sm font-medium transition",
                    category === item ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="my-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm text-blue-700">
              <Sparkles className="h-4 w-4" />
              当前展示教师备课高频工具
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索" className="w-36 bg-transparent outline-none" />
            </label>
          </div>

          <AiAppGrid apps={apps} courseId={courseId} />
        </section>
      ) : null}
    </div>
  );
}
