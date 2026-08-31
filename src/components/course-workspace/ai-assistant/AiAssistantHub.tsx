"use client";

import React, { useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  Activity,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Flame,
  HelpCircle,
  Layers,
  Lightbulb,
  MessageSquare,
  MessagesSquare,
  PlayCircle,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Star,
  Upload,
  Users
} from "lucide-react";
import {
  mockAiAssistantData,
  type AiAssistantTab,
  type KnowledgeBaseQaItem,
  type DiagnosticQuizItem,
  type RoleplayPersona,
  type KnowledgeFlashcard
} from "@/lib/courseWorkspace/aiAssistantMock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Props {
  courseId: string;
  courseTitle: string;
  canManage: boolean;
  children?: ReactNode;
}

type ProposalFeedback = typeof mockAiAssistantData.proposalFeedback;

function responseError(body: unknown, fallback: string) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : fallback;
}

async function requestAiAssistant<T>(courseId: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/courses/${courseId}/ai-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseError(result, "AI 服务调用失败，请重试"));
  return result as T;
}

export function AiAssistantHub({ courseId, courseTitle, canManage, children }: Props) {
  const [activeTab, setActiveTab] = useState<AiAssistantTab>("real-tutor");

  const tabs = [
    { id: "real-tutor" as const, label: "课程智能问答", icon: MessagesSquare, badge: "实时交互" },
    { id: "tutor" as const, label: "教材知识答疑", icon: BookOpenCheck, badge: "知识库" },
    { id: "scenario-quiz" as const, label: "随堂情境测验", icon: Activity, badge: "学情诊断" },
    { id: "proposal-review" as const, label: "方案初稿诊断", icon: FileCheck2, badge: "理论对照" },
    { id: "roleplay" as const, label: "角色演练模拟", icon: Users, badge: "实战仿真" },
    { id: "knowledge-cards" as const, label: "知识卡片与导图", icon: Layers, badge: "思维梳理" }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-panel lg:p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute right-1/3 -bottom-10 h-48 w-48 rounded-full bg-rose-500/10 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-indigo-200 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                上课 · AI 助教工作台
              </span>
              <Badge tone="blue">{canManage ? "教师督导模式" : "学生学习模式"}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white lg:text-3xl">
              AI 智能助教与实训工坊
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              基于《{courseTitle}》知识库构建。集成实时智能问答、教材答疑、情境测验诊断、方案结构化反馈、角色演练及知识导图生成。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-xs text-slate-400">挂载教材讲义</p>
              <p className="mt-1 text-lg font-bold text-white">12 篇核心资料</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-xs text-slate-400">知识点索引</p>
              <p className="mt-1 text-lg font-bold text-emerald-400">156 个概念</p>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation Sub-Tabs */}
      <div className="cx-hide-scrollbar flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-[var(--cx-blue)] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-normal",
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      {activeTab === "real-tutor" && (
        <div className="space-y-5">
          {children}
        </div>
      )}
      {activeTab === "tutor" && <KnowledgeQaSection courseId={courseId} courseTitle={courseTitle} />}
      {activeTab === "scenario-quiz" && <ScenarioQuizSection />}
      {activeTab === "proposal-review" && <ProposalReviewSection courseId={courseId} />}
      {activeTab === "roleplay" && <RoleplaySection courseId={courseId} courseTitle={courseTitle} />}
      {activeTab === "knowledge-cards" && <KnowledgeCardsSection />}
    </div>
  );
}

/* 1. 教材知识库答疑 */
function KnowledgeQaSection({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [query, setQuery] = useState("");
  const [qaList, setQaList] = useState<KnowledgeBaseQaItem[]>(mockAiAssistantData.qaItems);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    const question = query.trim();
    if (!question || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await requestAiAssistant<{ item: KnowledgeBaseQaItem }>(courseId, {
        mode: "knowledge_qa",
        question
      });
      setQaList((current) => [...current, result.item]);
      setQuery("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "教材答疑失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickPrompts = [
    "文化创新理论中的价值共创模型核心特征？",
    "如何设计出海文创方案的商业闭环？",
    "本课程期末小组考核的关键评分维度有哪些？"
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[var(--cx-blue)]" />
              <h2 className="font-semibold text-slate-900">课后智能答疑互动</h2>
            </div>
            <span className="text-xs text-slate-400">严格遵循教材知识库范围</span>
          </div>

          <div className="mt-4 space-y-4">
            {qaList.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--cx-blue-soft)] text-xs font-bold text-[var(--cx-blue)]">
                    问
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{item.question}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-3 border-t border-slate-200/60 pt-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-600">
                    答
                  </span>
                  <div className="flex-1 space-y-2.5 text-sm text-slate-700 leading-relaxed">
                    <p>{item.answer}</p>
                    {item.citations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-slate-400">出处溯源:</span>
                        {item.citations.map((c, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-indigo-100 bg-indigo-50/80 px-2 py-0.5 text-xs text-indigo-700">
                            <BookOpenCheck className="h-3 w-3" />
                            {c.source} · {c.chapter} {c.page ? `(P${c.page})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <div className="mt-5 space-y-3">
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuery(prompt)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-[var(--cx-blue)] hover:text-[var(--cx-blue)] transition"
                >
                  💡 {prompt}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="向 AI 助教提问本课程知识点、作业要求或案例分析..."
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[var(--cx-blue)] focus:ring-2 focus:ring-[var(--cx-blue)]/20"
              />
              <Button onClick={() => void handleSend()} disabled={isSubmitting || !query.trim()}>
                {isSubmitting ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                {isSubmitting ? "回答中" : "提问"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar Knowledge Base Status */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-panel">
          <h3 className="font-semibold text-slate-900">知识库挂载清单</h3>
          <p className="mt-1 text-xs text-slate-500">已自动同步本课程云盘与讲义资源</p>
          <div className="mt-4 space-y-3 text-xs text-slate-600">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="truncate font-medium text-slate-800">📘 《文化创新与设计》讲义第1-6章</span>
              <Badge tone="green">已就绪</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="truncate font-medium text-slate-800">📑 2026产教融合企业真实案例集.pdf</span>
              <Badge tone="green">已就绪</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="truncate font-medium text-slate-800">📊 期末小组实践方案评分量规.docx</span>
              <Badge tone="green">已就绪</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5">
          <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            AI 助教答疑准则
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-indigo-950/80">
            <li>• 严禁脱离课程教材进行无根据发散与捏造事实；</li>
            <li>• 优先给出教材章节与页码出处，方便学生核对；</li>
            <li>• 遇发散性讨论题，采用启发式追问引导自主思考。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* 2. 随堂情境测验与学情诊断 */
function ScenarioQuizSection() {
  const { scenarioQuiz } = mockAiAssistantData;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSelectOption = (qId: string, opt: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: opt.charAt(0) }));
  };

  return (
    <div className="space-y-6">
      {/* Scenario Card */}
      <div className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 p-6 shadow-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <Flame className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">{scenarioQuiz.scenarioTitle}</h2>
          </div>
          <Button variant="secondary" onClick={() => alert("AI 已根据最新教学大纲重新生成实战案例！")}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            换一个情境
          </Button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{scenarioQuiz.scenarioDescription}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quiz Items */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-semibold text-slate-900">随堂情境诊断题 ({scenarioQuiz.quizzes.length} 题)</h3>
              <Badge tone="orange">实时答题诊断</Badge>
            </div>
            <div className="mt-4 space-y-6">
              {scenarioQuiz.quizzes.map((quiz, qIdx) => (
                <div key={quiz.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <p className="font-medium text-slate-900 text-sm leading-6">
                    {qIdx + 1}. {quiz.stem}
                  </p>
                  <div className="mt-4 space-y-2">
                    {quiz.options?.map((opt) => {
                      const optChar = opt.charAt(0);
                      const selected = answers[quiz.id] === optChar;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSelectOption(quiz.id, opt)}
                          className={clsx(
                            "flex w-full items-center justify-between rounded-xl border p-3 text-left text-xs transition",
                            selected
                              ? "border-[var(--cx-blue)] bg-[var(--cx-blue-soft)] font-medium text-[var(--cx-blue)]"
                              : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          <span>{opt}</span>
                          {selected && <CheckCircle2 className="h-4 w-4 text-[var(--cx-blue)] shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                      <p className="font-semibold text-emerald-800">正确答案: {quiz.correctAnswer}</p>
                      <p className="mt-1 leading-5 text-slate-700">【AI解析】{quiz.analysis}</p>
                      <p className="mt-1 text-slate-500">全班掌握率: {quiz.masteryRate}%</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => { setAnswers({}); setSubmitted(false); }}>重置</Button>
              <Button onClick={() => setSubmitted(true)}>提交并查看实时诊断报告</Button>
            </div>
          </div>
        </div>

        {/* Real-time Diagnostics Radar / Stats */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
            <h3 className="font-semibold text-slate-900">全班学情实时雷达</h3>
            <p className="mt-1 text-xs text-slate-500">基于随堂互动与情境作答实时计算</p>

            <div className="mt-6 space-y-4">
              {scenarioQuiz.radarStats.map((stat) => (
                <div key={stat.label} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-slate-700">
                    <span>{stat.label}</span>
                    <span className="text-[var(--cx-blue)] font-bold">{stat.value}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${stat.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-xs text-amber-950">
              <p className="font-semibold text-amber-900">💡 教学干预建议</p>
              <p className="mt-1 leading-5">
                全班在“商业闭环设计”维度掌握度（78%）略显薄弱，建议在下节课针对“出海供应链测算”增加案例拆解。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 3. 小组方案初稿结构化反馈 */
function ProposalReviewSection({ courseId }: { courseId: string }) {
  const [inputText, setInputText] = useState("");
  const [feedback, setFeedback] = useState<ProposalFeedback | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const handleReview = async () => {
    const proposal = inputText.trim();
    if (proposal.length < 20 || isAnalyzing) return;
    setIsAnalyzing(true);
    setError("");
    try {
      const result = await requestAiAssistant<{ feedback: ProposalFeedback }>(courseId, {
        mode: "proposal_review",
        proposal
      });
      setFeedback(result.feedback);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "方案审定失败，请重试");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left Input & Preview */}
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-semibold text-slate-900">方案初稿智能评审与理论对照</h2>
              <p className="mt-1 text-xs text-slate-500">上传小组策划案初稿，AI 将自动对照教材理论框架进行多维打分与逐条批注</p>
            </div>
            <Badge tone="blue">理论框架量规</Badge>
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">请将方案正文粘贴到下方，AI 将读取文本进行真实评审</p>
              <p className="mt-1 text-xs text-slate-400">支持 20–12,000 字符；文档上传能力后续开放</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700">方案摘要与核心工作流文本</label>
              <textarea
                rows={4}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="可在此粘贴或修改方案文字片段，点击‘重新对照教材评审’..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-[var(--cx-blue)] focus:ring-2 focus:ring-[var(--cx-blue)]/20"
              />
            </div>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <div className="flex justify-end">
              <Button onClick={() => void handleReview()} disabled={isAnalyzing || inputText.trim().length < 20}>
                {isAnalyzing && <RefreshCw className="mr-1 h-4 w-4 animate-spin" />}
                {isAnalyzing ? "正在审定" : "对照教材理论进行结构化诊断"}
              </Button>
            </div>
          </div>
        </div>

        {/* Feedback Details */}
        {feedback && (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{feedback.proposalTitle}</h3>
                <p className="text-xs text-slate-500 mt-0.5">提交方：{feedback.submitter}</p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-indigo-50 px-4 py-2">
                <span className="text-xs text-indigo-700 font-medium">综合得分</span>
                <span className="text-2xl font-black text-indigo-600">{feedback.overallScore}</span>
                <span className="text-xs text-indigo-400">/100</span>
              </div>
            </div>

            {/* Rubrics */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">理论框架四维打分</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {feedback.rubrics.map((r) => (
                  <div key={r.dimension} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 text-xs">{r.dimension}</span>
                      <span className="font-bold text-[var(--cx-blue)] text-sm">{r.score} <span className="text-xs text-slate-400 font-normal">/{r.maxScore}</span></span>
                    </div>
                    <span className="inline-block rounded bg-indigo-100/70 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                      {r.theoryMapping}
                    </span>
                    <p className="text-xs leading-5 text-slate-600">{r.comment}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths & Suggestions */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <h5 className="font-semibold text-emerald-900 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  方案核心亮点
                </h5>
                <ul className="mt-3 space-y-2 text-xs text-emerald-950/80">
                  {feedback.strengths.map((s, idx) => (
                    <li key={idx} className="leading-relaxed">• {s}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                <h5 className="font-semibold text-amber-900 text-xs flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                  对照教材改进建议
                </h5>
                <ul className="mt-3 space-y-2 text-xs text-amber-950/80">
                  {feedback.suggestions.map((s, idx) => (
                    <li key={idx} className="leading-relaxed">• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Theoretical Reference Guideline */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
          <h3 className="font-semibold text-slate-900">理论对照标准库</h3>
          <p className="mt-1 text-xs text-slate-500">AI 评分基于以下教材核心理论模型</p>
          <div className="mt-4 space-y-3 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">1. 沉浸体验五感模型</p>
              <p className="mt-1 text-slate-500">对应教材第2章：视、听、触、味、嗅多感官联动设计。</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">2. 文化IP商业画布九要素</p>
              <p className="mt-1 text-slate-500">对应教材第4章：核心资源、价值主张与收入流设计。</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">3. AIGC伦理与合规安全规程</p>
              <p className="mt-1 text-slate-500">对应教材第6章：知识产权侵权审查与文化挪用防范。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 4. 角色演练模拟器 */
function RoleplaySection({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { roleplayPersonas } = mockAiAssistantData;
  const [selectedPersonaId, setSelectedPersonaId] = useState(roleplayPersonas[0].id);
  const currentPersona = roleplayPersonas.find((p) => p.id === selectedPersonaId) || roleplayPersonas[0];
  const [messages, setMessages] = useState<Array<{ sender: "ai" | "user"; text: string }>>([
    { sender: "ai", text: currentPersona.initialGreeting }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const handleSwitchPersona = (p: RoleplayPersona) => {
    requestIdRef.current += 1;
    setSelectedPersonaId(p.id);
    setMessages([{ sender: "ai", text: p.initialGreeting }]);
    setIsReplying(false);
    setError("");
  };

  const handleSendChat = async (textToSend?: string) => {
    const content = textToSend || chatInput;
    if (!content.trim() || isReplying) return;
    const nextMessages = [...messages, { sender: "user" as const, text: content }];
    setMessages(nextMessages);
    setChatInput("");
    setIsReplying(true);
    setError("");
    const requestId = ++requestIdRef.current;
    try {
      const result = await requestAiAssistant<{ reply: string }>(courseId, {
        mode: "roleplay",
        personaId: currentPersona.id,
        messages: nextMessages.slice(-16)
      });
      if (requestId === requestIdRef.current) {
        setMessages((current) => [...current, { sender: "ai", text: result.reply }]);
      }
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setError(requestError instanceof Error ? requestError.message : "角色演练回复失败，请重试");
      }
    } finally {
      if (requestId === requestIdRef.current) setIsReplying(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left Persona Selector & Goals */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
          <h3 className="font-semibold text-slate-900">选择模拟演练角色</h3>
          <p className="mt-1 text-xs text-slate-500">AI 模拟真实受众/客户，训练学生沟通与应变能力</p>
          <div className="mt-4 space-y-3">
            {roleplayPersonas.map((persona) => {
              const active = persona.id === selectedPersonaId;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => handleSwitchPersona(persona)}
                  className={clsx(
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
                    active
                      ? "border-[var(--cx-blue)] bg-[var(--cx-blue-soft)] shadow-sm"
                      : "border-slate-200/80 bg-white hover:bg-slate-50"
                  )}
                >
                  <span className="text-2xl">{persona.avatar}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900 text-sm">{persona.name}</p>
                      {active && <Badge tone="blue">正在演练</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{persona.role}</p>
                    <p className="text-[11px] text-slate-600 mt-2 line-clamp-2">性格：{persona.tone}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Persona Goals */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
          <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider text-slate-500">本轮对话通关目标</h4>
          <div className="mt-3 space-y-2 text-xs">
            {currentPersona.goals.map((goal, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{goal}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Chat Interface */}
      <div className="lg:col-span-2">
        <div className="flex h-[600px] flex-col rounded-3xl border border-slate-200/80 bg-white shadow-panel">
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{currentPersona.avatar}</span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{currentPersona.name} ({currentPersona.role})</h3>
                <p className="text-xs text-slate-500">正在与 AI 模拟角色实时对话演练中...</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => handleSwitchPersona(currentPersona)}>
              重新开始
            </Button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={clsx(
                  "flex gap-3 max-w-[85%]",
                  m.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">
                  {m.sender === "user" ? "🎓" : currentPersona.avatar}
                </span>
                <div
                  className={clsx(
                    "rounded-2xl p-4 text-xs leading-relaxed",
                    m.sender === "user"
                      ? "bg-[var(--cx-blue)] text-white"
                      : "bg-slate-50 border border-slate-100 text-slate-800"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isReplying && (
              <div className="mr-auto flex max-w-[85%] gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">{currentPersona.avatar}</span>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                  <RefreshCw className="mr-1 inline h-3.5 w-3.5 animate-spin" /> 正在结合你的回答追问...
                </div>
              </div>
            )}
          </div>

          {/* Suggested Quick Replies */}
          <div className="border-t border-slate-100 bg-slate-50/50 p-3">
            {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <p className="text-[11px] text-slate-400 mb-2">推荐演练应答话术：</p>
            <div className="flex flex-wrap gap-2">
              {currentPersona.samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => void handleSendChat(p)}
                  disabled={isReplying}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:border-[var(--cx-blue)] hover:text-[var(--cx-blue)] transition truncate max-w-[280px]"
                >
                  💬 {p}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="flex gap-2 p-4 border-t border-slate-100">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSendChat();
                }
              }}
              placeholder={`在《${courseTitle}》演练中输入您对 ${currentPersona.name} 的回答...`}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-[var(--cx-blue)] focus:ring-2 focus:ring-[var(--cx-blue)]/20"
            />
            <Button onClick={() => void handleSendChat()} disabled={isReplying || !chatInput.trim()}>
              <Send className="h-3.5 w-3.5 mr-1" />
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 5. 知识卡片与思维导图 */
function KnowledgeCardsSection() {
  const { knowledgeCards } = mockAiAssistantData;
  const [activeUnit, setActiveUnit] = useState<string>("all");
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});

  const toggleFlip = (cardId: string) => {
    setFlippedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const filteredCards = activeUnit === "all"
    ? knowledgeCards
    : knowledgeCards.filter((c) => c.unit.includes(activeUnit));

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">知识点卡片库与思维导图</h2>
          <p className="mt-1 text-xs text-slate-500">AI 自动提炼教材关键理论、结构化要点与经典案例，支持正反面翻转速记</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => alert("AI 正在重新生成知识拓扑图谱...")}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            一键生成导图
          </Button>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {filteredCards.map((card) => {
          const isFlipped = !!flippedCards[card.id];
          return (
            <div
              key={card.id}
              onClick={() => toggleFlip(card.id)}
              className={clsx(
                "cursor-pointer rounded-3xl border p-6 shadow-panel transition hover:-translate-y-1 hover:shadow-floating min-h-[320px] flex flex-col justify-between",
                isFlipped
                  ? "border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-slate-50 text-slate-900"
                  : "border-slate-200/80 bg-white text-slate-900"
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <Badge tone="blue">{card.unit}</Badge>
                  <span className="text-xs text-slate-400">点击翻转</span>
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">{card.title}</h3>
                
                {!isFlipped ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs leading-relaxed text-slate-600">{card.coreConcept}</p>
                    <div className="pt-3 border-t border-slate-100 space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500">核心要点：</p>
                      {card.frameworkPoints.map((pt, idx) => (
                        <div key={idx} className="text-xs text-slate-700">• {pt}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl border border-indigo-100 bg-white/90 p-3.5 text-xs text-indigo-950 leading-relaxed">
                      <p className="font-bold text-indigo-900 mb-1">🌟 经典实战案例拆解</p>
                      {card.caseExample}
                    </div>
                    <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-3 text-[11px] text-slate-600">
                      💡 教学思考题：结合你当前的小组命题，该理论可在哪一步骤提供方法论支撑？
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span>{isFlipped ? "查看概念背面" : "查看案例背面"}</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mindmap Interactive Tree View */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900">课程核心思维导图概览</h3>
          </div>
          <Badge tone="blue">层级知识树</Badge>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <p className="font-bold text-indigo-900 text-sm">1. 文化母体与符号解构</p>
            <div className="mt-3 space-y-1.5 text-xs text-indigo-950/80 pl-2 border-l-2 border-indigo-300">
              <p>├ 物质文化层（器物/纹饰）</p>
              <p>├ 行为仪式层（交互/体验）</p>
              <p>└ 精神价值层（哲学/认同）</p>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
            <p className="font-bold text-rose-900 text-sm">2. AIGC多模态工作流</p>
            <div className="mt-3 space-y-1.5 text-xs text-rose-950/80 pl-2 border-l-2 border-rose-300">
              <p>├ Prompt提示词工程体系</p>
              <p>├ LoRA/ControlNet微调控制</p>
              <p>└ 知识库向量检索(RAG)</p>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <p className="font-bold text-emerald-900 text-sm">3. 商业闭环与出海策略</p>
            <div className="mt-3 space-y-1.5 text-xs text-emerald-950/80 pl-2 border-l-2 border-emerald-300">
              <p>├ 商业画布与投产比模型</p>
              <p>├ 跨文化传播转译策略</p>
              <p>└ 知识产权与法律伦理合规</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
