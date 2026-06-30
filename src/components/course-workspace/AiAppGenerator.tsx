"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload,
  CourseAiAppType,
  CourseAiArtifactPayload,
  HtmlCoursewarePayload
} from "@/types/courseWorkspace";
import type { CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import { Button } from "@/components/ui/Button";

type GeneratorOptions = {
  chapter: string;
  difficulty: string;
  questionType: string;
  questionCount: number;
  lessonMinutes: number;
  teachingMethod: string;
  slideCount: number;
  coursewareStyle: string;
  paperScore: number;
};

const defaultOptions: GeneratorOptions = {
  chapter: "全课程",
  difficulty: "基础",
  questionType: "混合",
  questionCount: 5,
  lessonMinutes: 65,
  teachingMethod: "讲授结合实践",
  slideCount: 8,
  coursewareStyle: "课堂讲授",
  paperScore: 100
};

export type SerializedAiArtifact = {
  id: string;
  appType: string;
  title: string;
  prompt: string | null;
  payload: string;
  createdAt: Date | string;
};

function parsePayload(artifact: SerializedAiArtifact): CourseAiArtifactPayload | null {
  try {
    return JSON.parse(artifact.payload) as CourseAiArtifactPayload;
  } catch {
    return null;
  }
}

function Preview({ appType, payload }: { appType: CourseAiAppType; payload: CourseAiArtifactPayload | null }) {
  if (!payload) return <p className="text-sm text-slate-500">该产物暂时无法预览。</p>;

  if (appType === "question_generation") {
    const data = payload as AiQuestionPayload;
    return (
      <div className="space-y-3">
        {data.questions.map((question, index) => (
          <article key={question.id ?? index} className="rounded-xl bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{index + 1}. {question.stem}</p>
            {question.options ? (
              <ul className="mt-2 grid gap-1 text-sm text-slate-600 md:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <li key={option}>{String.fromCharCode(65 + optionIndex)}. {option}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-sm text-blue-700">答案：{question.answer}</p>
            <p className="mt-1 text-sm text-slate-500">{question.explanation}</p>
          </article>
        ))}
      </div>
    );
  }

  if (appType === "lesson_plan") {
    const data = payload as AiLessonPlanPayload;
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">教学目标</h3>
          <ul className="mt-2 list-inside list-disc text-sm leading-7 text-slate-600">
            {data.objectives.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">环节</th>
                <th className="px-4 py-3">分钟</th>
                <th className="px-4 py-3">活动</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.teachingProcess.map((phase) => (
                <tr key={phase.phase}>
                  <td className="px-4 py-3 font-medium text-slate-900">{phase.phase}</td>
                  <td className="px-4 py-3 text-slate-600">{phase.minutes}</td>
                  <td className="px-4 py-3 text-slate-600">{phase.activity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (appType === "courseware") {
    const data = payload as AiCoursewarePayload;
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {data.slides.map((slide, index) => (
          <article key={`${slide.title}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs text-slate-400">Slide {index + 1}</p>
            <h3 className="mt-1 font-semibold text-slate-900">{slide.title}</h3>
            <ul className="mt-2 list-inside list-disc text-sm leading-7 text-slate-600">
              {slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{slide.speakerNotes}</p>
          </article>
        ))}
      </div>
    );
  }

  if (appType === "html_courseware") {
    const data = payload as HtmlCoursewarePayload;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">课件页数</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{data.slideCount}</p>
          <p className="mt-2 text-sm text-slate-500">风格：{data.theme ?? "课堂播放"}</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <iframe title="HTML课件预览" srcDoc={data.html} className="h-[520px] w-full bg-white" />
        </div>
      </div>
    );
  }

  const data = payload as AiPaperPayload;
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900">{data.title}</h3>
      {data.sections.map((section) => (
        <article key={section.name} className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-slate-900">{section.name}</p>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">{section.score} 分</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">题目：{section.questionIds.join("、")}</p>
        </article>
      ))}
    </div>
  );
}

export function AiAppGenerator({
  courseId,
  app,
  initialArtifacts
}: {
  courseId: string;
  app: CourseAiAppDefinition & { appType: CourseAiAppType };
  initialArtifacts: SerializedAiArtifact[];
}) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<GeneratorOptions>(defaultOptions);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [selectedId, setSelectedId] = useState(initialArtifacts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0], [artifacts, selectedId]);
  const payload = selected ? parsePayload(selected) : null;

  function updateOption<Key extends keyof GeneratorOptions>(key: Key, value: GeneratorOptions[Key]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function structuredPrompt() {
    const common = [`章节：${options.chapter}`, `难度：${options.difficulty}`];
    if (app.appType === "question_generation") {
      return [...common, `题型：${options.questionType}`, `题量：${options.questionCount}`, `补充要求：${prompt || "无"}`].join("；");
    }
    if (app.appType === "lesson_plan") {
      return [...common, `课时：${options.lessonMinutes}`, `教法：${options.teachingMethod}`, `补充要求：${prompt || "无"}`].join("；");
    }
    if (app.appType === "courseware" || app.appType === "html_courseware") {
      return [...common, `页数：${options.slideCount}`, `风格：${options.coursewareStyle}`, `补充要求：${prompt || "无"}`].join("；");
    }
    return [...common, `总分：${options.paperScore}`, `补充要求：${prompt || "无"}`].join("；");
  }

  function defaultTitle() {
    if (prompt) return `${app.title}：${prompt.slice(0, 18)}`;
    if (app.appType === "question_generation") return `${app.title}：${options.questionType}${options.questionCount}题`;
    if (app.appType === "lesson_plan") return `${app.title}：${options.lessonMinutes}分钟${options.teachingMethod}`;
    if (app.appType === "courseware" || app.appType === "html_courseware") return `${app.title}：${options.coursewareStyle}${options.slideCount}页`;
    return `${app.title}：${options.paperScore}分${options.difficulty}卷`;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch(`/api/courses/${courseId}/ai-apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appType: app.appType,
        prompt: structuredPrompt(),
        title: defaultTitle()
      })
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "生成失败");
      return;
    }

    setArtifacts((current) => [body.artifact, ...current]);
    setSelectedId(body.artifact.id);
    setPrompt("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>适用章节</span>
              <input
                value={options.chapter}
                onChange={(event) => updateOption("chapter", event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>难度</span>
              <select
                value={options.difficulty}
                onChange={(event) => updateOption("difficulty", event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
              >
                <option>基础</option>
                <option>提高</option>
                <option>综合</option>
                <option>挑战</option>
              </select>
            </label>
          </div>

          {app.appType === "question_generation" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>题型</span>
                <select
                  value={options.questionType}
                  onChange={(event) => updateOption("questionType", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
                >
                  <option>混合</option>
                  <option>单选</option>
                  <option>多选</option>
                  <option>简答</option>
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>题量</span>
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={options.questionCount}
                  onChange={(event) => updateOption("questionCount", Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
                />
              </label>
            </div>
          ) : null}

          {app.appType === "lesson_plan" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>课时分钟</span>
                <input
                  type="number"
                  min={30}
                  max={180}
                  value={options.lessonMinutes}
                  onChange={(event) => updateOption("lessonMinutes", Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>教法</span>
                <select
                  value={options.teachingMethod}
                  onChange={(event) => updateOption("teachingMethod", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
                >
                  <option>讲授结合实践</option>
                  <option>任务驱动</option>
                  <option>案例研讨</option>
                  <option>翻转课堂</option>
                </select>
              </label>
            </div>
          ) : null}

          {app.appType === "courseware" || app.appType === "html_courseware" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>页数</span>
                <input
                  type="number"
                  min={5}
                  max={16}
                  value={options.slideCount}
                  onChange={(event) => updateOption("slideCount", Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>风格</span>
                <select
                  value={options.coursewareStyle}
                  onChange={(event) => updateOption("coursewareStyle", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
                >
                  <option>课堂讲授</option>
                  <option>案例分析</option>
                  <option>实训操作</option>
                  <option>复习总结</option>
                </select>
              </label>
            </div>
          ) : null}

          {app.appType === "paper_assembly" ? (
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>试卷总分</span>
              <input
                type="number"
                min={30}
                max={150}
                value={options.paperScore}
                onChange={(event) => updateOption("paperScore", Number(event.target.value))}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400"
              />
            </label>
          ) : null}

          <div>
            <label htmlFor="ai-app-prompt" className="text-sm font-medium text-slate-700">生成要求</label>
            <textarea
              id="ai-app-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={`补充${app.title}要求`}
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-700">
            {structuredPrompt()}
          </div>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "生成中" : "生成"}
          </Button>
        </form>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">历史产物</h2>
          <div className="mt-3 space-y-2">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                onClick={() => setSelectedId(artifact.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                  selected?.id === artifact.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="line-clamp-1 font-medium">{artifact.title}</span>
                <span className="mt-1 block text-xs text-slate-400">{new Date(artifact.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
              </button>
            ))}
            {!artifacts.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">暂无生成记录</p> : null}
          </div>
        </div>
      </aside>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 border-b border-slate-100 pb-4">
          <p className="text-sm text-slate-500">结果预览</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{selected?.title ?? app.title}</h2>
        </div>
        <Preview appType={app.appType} payload={payload} />
      </section>
    </div>
  );
}
