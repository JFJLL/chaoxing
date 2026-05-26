"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload,
  CourseAiAppType,
  CourseAiArtifactPayload
} from "@/types/courseWorkspace";
import type { CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";
import { Button } from "@/components/ui/Button";

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
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [selectedId, setSelectedId] = useState(initialArtifacts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0], [artifacts, selectedId]);
  const payload = selected ? parsePayload(selected) : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch(`/api/courses/${courseId}/ai-apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appType: app.appType,
        prompt,
        title: prompt ? `${app.title}：${prompt.slice(0, 18)}` : undefined
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
          <div>
            <label htmlFor="ai-app-prompt" className="text-sm font-medium text-slate-700">生成要求</label>
            <textarea
              id="ai-app-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={`输入${app.title}要求`}
              className="mt-2 min-h-32 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
            />
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
