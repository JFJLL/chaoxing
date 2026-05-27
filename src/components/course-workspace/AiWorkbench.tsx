"use client";

import { useMemo, useState } from "react";
import { Bot, ChevronRight, Search, Sparkles, Wand2 } from "lucide-react";
import { clsx } from "clsx";
import { AiAppGrid } from "@/components/course-workspace/AiAppGrid";
import { courseAiApps } from "@/lib/courseWorkspace/aiApps";

const topTabs = ["AI助教", "AI应用", "AI实践", "AI学情分析"] as const;
const categories = ["全部应用", "备课中心", "教学神器", "学习助手", "资料科研"] as const;

export function AiWorkbench({ courseId }: { courseId: string }) {
  const [topTab, setTopTab] = useState<(typeof topTabs)[number]>("AI应用");
  const [category, setCategory] = useState<(typeof categories)[number]>("全部应用");
  const [keyword, setKeyword] = useState("");

  const apps = useMemo(
    () =>
      courseAiApps.filter((app) => {
        const matchCategory = category === "全部应用" || app.category === category;
        const matchKeyword = !keyword || app.title.includes(keyword) || app.description.includes(keyword);
        return matchCategory && matchKeyword;
      }),
    [category, keyword]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-full bg-white p-1 shadow-sm">
          {topTabs.map((tab) => (
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
        <div className="flex max-w-xl flex-1 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm lg:max-w-md xl:max-w-lg">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="AI智能检索资源" />
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
            <Wand2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {topTab !== "AI应用" ? (
        <section className="rounded-[28px] bg-white p-10 text-center shadow-sm">
          <Bot className="mx-auto h-12 w-12 text-blue-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{topTab}</h1>
          <p className="mt-2 text-sm text-slate-500">本地课程空间已保留该入口。</p>
        </section>
      ) : (
        <section className="rounded-[28px] bg-white p-5 shadow-sm lg:p-7">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 xl:flex-row xl:items-center xl:justify-between">
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
            <button type="button" className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[#2165f3] to-[#08b7d8] px-4 text-sm font-medium text-white">
              AI应用开放平台
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="my-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-[#2165f3] px-4 text-sm font-medium text-white">
                <Sparkles className="h-4 w-4" />
                创建AI应用
              </button>
              <button type="button" className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-600">全部应用</button>
              <button type="button" className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-600">批量管理</button>
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索" className="w-36 bg-transparent outline-none" />
            </label>
          </div>

          <AiAppGrid apps={apps} courseId={courseId} />
        </section>
      )}
    </div>
  );
}
