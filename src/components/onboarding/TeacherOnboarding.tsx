"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

type TourState = {
  step: number;
  courseId: string | null;
};

type TargetPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom" | "none";
};

type TourStep = {
  target?: string;
  title: string;
  body: string;
  route: (courseId: string | null) => string;
};

const tourSteps: TourStep[] = [
  {
    title: "欢迎使用课程空间",
    body: "接下来会用几步带你认识教师端的核心入口，帮助你更快完成课程准备、AI 备课和师生沟通。",
    route: () => "/space"
  },
  {
    target: "create-course",
    title: "从这里新建课程",
    body: "新建课程后，你会拥有独立的课程工作台，用于组织资料、AI 备课和学生沟通。请在需要时点击这里完成创建。",
    route: () => "/space/courses"
  },
  {
    target: "start-document-import",
    title: "从这里导入课程文档",
    body: "点击“课程内容与知识”后可上传教材、教案或课程大纲。系统会解析课程结构，为后续 AI 备课提供可信的课程依据。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench`
  },
  {
    target: "upload-course-resource",
    title: "在这里补充课程资料",
    body: "上传图片、讲义和其他教学材料后，学生可以在课程中查看，AI 也可以在备课时引用。",
    route: (courseId) => `/space/courses/${courseId}/resources`
  },
  {
    target: "generate-courseware",
    title: "在这里生成 AI 课件",
    body: "选择已确认的教学内容，填写页数和风格后，可得到一份可编辑的课件草稿。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/courseware`
  },
  {
    target: "generate-ppt-courseware",
    title: "在这里生成正式 PPT",
    body: "确认 AI 课件后，可按页生成整页视觉 PPT。每张成功页面消耗 1 积分；失败页面会按规则退回积分。",
    route: (courseId) => `/space/courses/${courseId}/ai-workbench/apps/ppt_courseware`
  },
  {
    target: "compose-message",
    title: "在这里给学生写消息",
    body: "收信箱集中处理学生问题。消息可附带图片、文档和课程云盘引用文件，让沟通和材料保留在同一处。",
    route: () => "/space/inbox"
  }
];

const PANEL_WIDTH = 320;
const PANEL_GAP = 14;

function findTarget(target: string) {
  return document.querySelector<HTMLElement>(`[data-teacher-onboarding="${target}"]`);
}

function getWelcomePosition(): TargetPosition {
  return {
    left: Math.max(16, Math.round((window.innerWidth - PANEL_WIDTH) / 2)),
    top: 96,
    placement: "none"
  };
}

function getPosition(target: HTMLElement, panelHeight: number): TargetPosition {
  const rect = target.getBoundingClientRect();
  const maxLeft = Math.max(12, window.innerWidth - PANEL_WIDTH - 12);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - PANEL_WIDTH / 2), maxLeft);
  const canPlaceBelow = rect.bottom + PANEL_GAP + panelHeight <= window.innerHeight - 12;
  return {
    left,
    top: canPlaceBelow ? rect.bottom + PANEL_GAP : Math.max(12, rect.top - panelHeight - PANEL_GAP),
    placement: canPlaceBelow ? "bottom" : "top"
  };
}

export function TeacherOnboarding({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const pathnameRef = useRef(pathname);
  const sessionStartedRef = useRef(false);
  const [tour, setTour] = useState<TourState | null>(null);
  const [position, setPosition] = useState<TargetPosition | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetReady, setTargetReady] = useState(false);

  const persist = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("保存引导状态失败");
    return response.json() as Promise<{ show: boolean; onboardingStep: number; onboardingCourseId: string | null }>;
  }, []);

  const routeFor = useCallback((step: number, courseId: string | null) => {
    if (step === 0) return "/space";
    if (step === 1 || step === tourSteps.length - 1) return tourSteps[step]!.route(courseId);
    return courseId ? tourSteps[step]!.route(courseId) : "/space/courses";
  }, []);

  const moveTo = useCallback(async (step: number, courseId: string | null) => {
    const response = await persist({ action: "SAVE_STEP", step });
    const next = { step: response.onboardingStep, courseId: response.onboardingCourseId ?? courseId };
    setTour(next);
    setTargetReady(false);
    const route = routeFor(next.step, next.courseId);
    if (pathname !== route) router.push(route);
  }, [pathname, persist, routeFor, router]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!enabled || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    let cancelled = false;
    void persist({ action: "START_SESSION" }).then((response) => {
      if (cancelled || !response.show) return;
      const next = { step: response.onboardingStep, courseId: response.onboardingCourseId };
      setTour(next);
      if (next.step > 0) {
        const route = routeFor(next.step, next.courseId);
        if (pathnameRef.current !== route) router.replace(route);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [enabled, persist, routeFor, router]);

  useEffect(() => {
    function onCourseCreated(event: Event) {
      const courseId = (event as CustomEvent<{ courseId?: string }>).detail?.courseId;
      if (!courseId) return;
      // 先乐观进入第三步；课程创建已成功，不能再让一次轻量状态写入阻塞目标气泡。
      setTour({ step: 2, courseId });
      setTargetReady(false);
      void persist({ action: "SET_COURSE", courseId, step: 2 }).then((response) => {
        setTour({ step: response.onboardingStep, courseId: response.onboardingCourseId ?? courseId });
      }).catch(() => undefined);
    }

    function onRestart() {
      setSaving(true);
      void persist({ action: "RESTART" }).then((response) => {
        setTour({ step: response.onboardingStep, courseId: response.onboardingCourseId });
        setPosition(getWelcomePosition());
        setTargetReady(true);
        router.push("/space");
      }).finally(() => setSaving(false));
    }

    window.addEventListener("teacher-onboarding:course-created", onCourseCreated);
    window.addEventListener("teacher-onboarding:restart", onRestart);
    return () => {
      window.removeEventListener("teacher-onboarding:course-created", onCourseCreated);
      window.removeEventListener("teacher-onboarding:restart", onRestart);
    };
  }, [persist, router]);

  useLayoutEffect(() => {
    if (!tour) return;
    const targetName = tourSteps[tour.step]?.target;
    if (!targetName) {
      setPosition(getWelcomePosition());
      setTargetReady(true);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let restoreTarget: (() => void) | undefined;
    // 路由切换期间先保留一个安全位置并隐藏面板，目标节点挂载后再展示，避免气泡消失。
    setPosition((current) => current ?? getWelcomePosition());
    setTargetReady(false);
    const update = () => {
      const target = findTarget(targetName);
      if (!target) {
        attempts += 1;
        if (attempts < 20 && !cancelled) window.setTimeout(update, 120);
        return;
      }
      if (targetRef.current !== target) {
        restoreTarget?.();
        const previousOutline = target.style.outline;
        const previousOffset = target.style.outlineOffset;
        const previousRadius = target.style.borderRadius;
        target.style.outline = "3px solid #e11d48";
        target.style.outlineOffset = "4px";
        target.style.borderRadius = target.style.borderRadius || "10px";
        targetRef.current = target;
        restoreTarget = () => {
          target.style.outline = previousOutline;
          target.style.outlineOffset = previousOffset;
          target.style.borderRadius = previousRadius;
        };
      }
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 220;
      setPosition(getPosition(target, panelHeight));
      setTargetReady(true);
    };
    update();
    // 页面内容在路由流式加载后才会挂载。与其最多轮询 2.4 秒，不如观察 DOM，
    // 这样第三步的工作台卡片一出现便立即定位气泡。
    const observer = new MutationObserver(() => {
      if (!targetRef.current) update();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      restoreTarget?.();
      targetRef.current = null;
    };
  }, [pathname, tour]);

  async function pause() {
    if (!tour) return;
    setSaving(true);
    try {
      await persist({ action: "PAUSE", step: tour.step });
      setTour(null);
      setTargetReady(false);
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (!tour) return;
    if (tour.step === tourSteps.length - 1) {
      setSaving(true);
      try {
        await persist({ action: "COMPLETED" });
        setTour(null);
        setTargetReady(false);
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      await moveTo(tour.step + 1, tour.courseId);
    } finally {
      setSaving(false);
    }
  }

  async function prev() {
    if (!tour || tour.step === 0) return;
    setSaving(true);
    try {
      await moveTo(tour.step - 1, tour.courseId);
    } finally {
      setSaving(false);
    }
  }

  if (!tour || !position) return null;
  const current = tourSteps[tour.step]!;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[90] bg-slate-950/10" aria-hidden="true" />
      <section
        ref={panelRef}
        role="dialog"
        aria-live="polite"
        aria-labelledby="teacher-onboarding-title"
        className={`fixed z-[91] w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-opacity ${targetReady ? "opacity-100" : "opacity-0"}`}
        style={{ left: position.left, top: position.top }}
      >
        {position.placement !== "none" ? <span aria-hidden="true" className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-slate-200 bg-white ${position.placement === "bottom" ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r"}`} /> : null}
        <p className="text-xs font-semibold tracking-wide text-rose-600">教师新手引导 · {tour.step + 1}/{tourSteps.length}</p>
        <h2 id="teacher-onboarding-title" className="mt-2 text-base font-semibold text-slate-900">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{current.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" disabled={saving} onClick={() => void pause()} className="text-sm font-medium text-slate-500 hover:text-slate-800">跳过</button>
            <button type="button" disabled={saving || tour.step === 0} onClick={() => void prev()} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <ArrowLeft className="h-3.5 w-3.5" />
              上一步
            </button>
          </div>
          <button type="button" disabled={saving} onClick={() => void next()} className="inline-flex h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
            <ArrowRight className="h-3.5 w-3.5" />
            {saving ? "保存中…" : "下一步"}
          </button>
        </div>
      </section>
    </>
  );
}
