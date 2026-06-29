import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload,
  CourseAiAppType,
  CourseAiArtifactPayload,
  HtmlCoursewarePayload
} from "@/types/courseWorkspace";
import { createJsonCompletion, resolveAiModelConfig } from "@/lib/ai/modelClient";

type ChapterInput = {
  title: string;
  lessons: Array<{ title: string; summary?: string | null }>;
};

type HtmlSlideSpec = {
  title: string;
  subtitle?: string;
  bullets: string[];
  accent?: string;
  note?: string;
};

export type GenerateCourseAiArtifactInput = {
  appType: CourseAiAppType;
  courseTitle: string;
  chapters: ChapterInput[];
  prompt?: string;
};

function optionNumber(prompt: string | undefined, label: string, fallback: number, min: number, max: number) {
  const match = prompt?.match(new RegExp(`${label}[:：]\\s*(\\d+)`));
  const value = match ? Number(match[1]) : fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function optionText(prompt: string | undefined, label: string, fallback: string) {
  const match = prompt?.match(new RegExp(`${label}[:：]\\s*([^；;\\n]+)`));
  return match?.[1]?.trim() || fallback;
}

function learningPoints(input: GenerateCourseAiArtifactInput) {
  const fromLessons = input.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({
      chapter: chapter.title,
      lesson: lesson.title,
      summary: lesson.summary
    }))
  );

  if (fromLessons.length) return fromLessons;

  return [
    { chapter: input.courseTitle, lesson: "课程导入", summary: input.prompt || "理解课程核心概念" },
    { chapter: input.courseTitle, lesson: "重点讲解", summary: "梳理关键知识点" },
    { chapter: input.courseTitle, lesson: "实践应用", summary: "完成课堂练习与迁移应用" }
  ];
}

function generateQuestions(input: GenerateCourseAiArtifactInput): AiQuestionPayload {
  const points = learningPoints(input);
  const questionCount = optionNumber(input.prompt, "题量", 5, 3, 12);
  const difficulty = optionText(input.prompt, "难度", "基础");
  const requestedType = optionText(input.prompt, "题型", "混合");
  const templatePool = ["single_choice", "multiple_choice", "short_answer"] as const;
  const templates = Array.from({ length: questionCount }, (_, index) => {
    if (requestedType.includes("单选")) return "single_choice";
    if (requestedType.includes("多选")) return "multiple_choice";
    if (requestedType.includes("简答")) return "short_answer";
    return templatePool[index % templatePool.length];
  });

  return {
    questions: templates.map((type, index) => {
      const point = points[index % points.length];
      const id = `q-${index + 1}`;
      if (type === "short_answer") {
        return {
          id,
          type,
          stem: `结合“${point.lesson}”，说明其在《${input.courseTitle}》中的学习价值，并体现${difficulty}层级要求。`,
          answer: `应围绕${point.chapter}的目标，说明${point.lesson}的概念、场景和应用边界。`,
          explanation: point.summary || "考查学生对课程重点的理解和迁移表达。"
        };
      }

      return {
        id,
        type,
        stem: `关于“${point.lesson}”（${difficulty}），下列说法${type === "multiple_choice" ? "正确的有" : "正确的是"}？`,
        options: [
          `它属于${point.chapter}的学习内容`,
          "它与本课程没有关系",
          "它只能通过线下讲授完成",
          "它可以结合资料和任务点进行学习"
        ],
        answer: type === "multiple_choice" ? "A、D" : "A",
        explanation: point.summary || `题目围绕${point.chapter}中的${point.lesson}生成。`
      };
    })
  };
}

function generateLessonPlan(input: GenerateCourseAiArtifactInput): AiLessonPlanPayload {
  const points = learningPoints(input).slice(0, 4);
  const totalMinutes = optionNumber(input.prompt, "课时", 65, 30, 180);
  const method = optionText(input.prompt, "教法", "讲授结合实践");
  const practiceMinutes = Math.max(10, Math.round(totalMinutes * 0.38));
  const lectureMinutes = Math.max(10, Math.round(totalMinutes * 0.34));
  const introMinutes = Math.max(5, Math.round(totalMinutes * 0.12));
  const summaryMinutes = Math.max(5, totalMinutes - introMinutes - lectureMinutes - practiceMinutes);

  return {
    objectives: [
      `理解《${input.courseTitle}》的核心知识框架`,
      `能够解释${points[0]?.lesson ?? "课程重点"}的关键概念`,
      "完成一次课堂实践并形成可复盘成果"
    ],
    keyPoints: points.map((point) => `${point.chapter}：${point.lesson}`),
    teachingProcess: [
      { phase: "导入", minutes: introMinutes, activity: `用真实场景引出《${input.courseTitle}》的学习任务` },
      { phase: "讲授", minutes: lectureMinutes, activity: `采用${method}，围绕${points[0]?.lesson ?? "课程重点"}讲解概念与边界` },
      { phase: "实践", minutes: practiceMinutes, activity: `分组完成${points[1]?.lesson ?? "课堂练习"}并提交结果` },
      { phase: "总结", minutes: summaryMinutes, activity: "师生共同整理知识清单和后续任务" }
    ],
    assessment: ["课堂提问完成度", "实践任务提交质量", "学习反思的结构完整性"]
  };
}

function generateCourseware(input: GenerateCourseAiArtifactInput): AiCoursewarePayload {
  const points = learningPoints(input);
  const slideCount = optionNumber(input.prompt, "页数", 6, 5, 16);
  const style = optionText(input.prompt, "风格", "课堂讲授");
  const slides = [
    {
      title: input.courseTitle,
      bullets: ["课程目标", "学习路径", `${style}风格`],
      speakerNotes: "说明本节课的目标和预期成果。"
    },
    ...points.slice(0, 4).map((point) => ({
      title: point.lesson,
      bullets: [point.chapter, point.summary || "关键概念梳理", "课堂应用提示"],
      speakerNotes: `讲解${point.lesson}，并结合${point.chapter}安排提问。`
    })),
    {
      title: "总结与任务",
      bullets: ["知识回顾", "任务点检查", "课后延展"],
      speakerNotes: "回收课堂反馈，明确课后任务。"
    }
  ];

  while (slides.length < slideCount) {
    slides.splice(slides.length - 1, 0, {
      title: `拓展案例 ${slides.length - 1}`,
      bullets: ["场景描述", "操作步骤", "风险边界"],
      speakerNotes: "补充本课程的本地案例。"
    });
  }

  return { slides };
}

function generatePaper(input: GenerateCourseAiArtifactInput): AiPaperPayload {
  const totalScore = optionNumber(input.prompt, "总分", 100, 30, 150);
  const difficulty = optionText(input.prompt, "难度", "综合");
  const singleScore = Math.round(totalScore * 0.25);
  const multipleScore = Math.round(totalScore * 0.25);
  const shortScore = totalScore - singleScore - multipleScore;

  return {
    title: `${input.courseTitle} ${difficulty}阶段测验`,
    sections: [
      { name: "单选题", score: singleScore, questionIds: ["q-1", "q-4"] },
      { name: "多选题", score: multipleScore, questionIds: ["q-2"] },
      { name: "简答题", score: shortScore, questionIds: ["q-3", "q-5"] }
    ]
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripUnsafeHtml(html: string) {
  return html
    .replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript:/gi, "");
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

function safeAiErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "未知错误";
  return raw
    .replace(/([?&](?:key|api_key|apiKey)=)[^&\s]+/gi, "$1***")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1***")
    .slice(0, 180);
}

function htmlCoursewareSlides(input: GenerateCourseAiArtifactInput): HtmlSlideSpec[] {
  const points = learningPoints(input);
  const slideCount = optionNumber(input.prompt, "页数", 8, 5, 16);
  const style = optionText(input.prompt, "风格", "课堂播放");
  const chapterTitles = input.chapters.map((chapter) => chapter.title).slice(0, 6);
  const pointSlides = points.slice(0, Math.max(1, slideCount - 3)).map((point, index) => ({
    title: point.lesson,
    subtitle: point.chapter,
    accent: index % 3 === 0 ? "blue" : index % 3 === 1 ? "green" : "amber",
    bullets: [
      point.summary || `理解“${point.lesson}”的核心概念和使用边界。`,
      "把知识点放回真实任务场景，判断它解决什么问题。",
      "用一个课堂问题或小练习完成即时反馈。"
    ],
    note: `讲解${point.lesson}时，先给出场景，再拆解方法，最后让学生复述判断标准。`
  }));

  const slides: HtmlSlideSpec[] = [
    {
      title: input.courseTitle,
      subtitle: `${style} · 课堂交互课件`,
      accent: "cover",
      bullets: ["建立课程全景", "抓住关键概念", "完成应用迁移"],
      note: "开场说明本节课的学习目标、知识路径和预期产出。"
    },
    {
      title: "学习路径",
      subtitle: "从课程结构进入关键任务",
      accent: "green",
      bullets: chapterTitles.length ? chapterTitles : ["概念导入", "方法拆解", "实践应用", "总结反馈"],
      note: "用学习路径帮助学生知道先学什么、后做什么。"
    },
    ...pointSlides,
    {
      title: "课堂收束",
      subtitle: "把知识转成可检查的行动",
      accent: "amber",
      bullets: ["复述一个核心概念", "完成一次场景判断", "提交一个可复盘任务"],
      note: "用三项可观察行为收束课堂，方便课后跟踪。"
    }
  ];

  while (slides.length < slideCount) {
    const point = points[(slides.length - 2) % points.length];
    slides.splice(slides.length - 1, 0, {
      title: `案例演练：${point.lesson}`,
      subtitle: point.chapter,
      accent: "violet",
      bullets: ["给出案例背景", "标出关键判断点", "讨论可迁移做法"],
      note: "补充一个贴近课程主题的短案例。"
    });
  }

  return slides.slice(0, slideCount);
}

function renderFallbackHtmlCourseware(input: GenerateCourseAiArtifactInput): HtmlCoursewarePayload {
  const slides = htmlCoursewareSlides(input);
  const theme = optionText(input.prompt, "风格", "课堂播放");
  const htmlSlides = slides
    .map(
      (slide, index) => `<section class="slide ${index === 0 ? "cover" : ""}" data-slide="${index}">
  <div class="slide__chrome">
    <span>${escapeHtml(theme)}</span>
    <strong>${index + 1} / ${slides.length}</strong>
  </div>
  <div class="slide__body">
    <p class="kicker">${escapeHtml(slide.subtitle || input.courseTitle)}</p>
    <h1>${escapeHtml(slide.title)}</h1>
    <div class="content-grid">
      ${slide.bullets
        .map(
          (bullet, bulletIndex) => `<article class="point point--${escapeHtml(slide.accent || "blue")}">
        <span>${String(bulletIndex + 1).padStart(2, "0")}</span>
        <p>${escapeHtml(bullet)}</p>
      </article>`
        )
        .join("")}
    </div>
    ${slide.note ? `<p class="note">${escapeHtml(slide.note)}</p>` : ""}
  </div>
</section>`
    )
    .join("\n");

  return {
    html: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.courseTitle)}</title>
  <style>
    :root{color-scheme:light;--ink:#122033;--muted:#617087;--line:#dbe5f3;--blue:#2f6fed;--green:#179c74;--amber:#d99124;--violet:#7455d6}
    *{box-sizing:border-box}
    body{margin:0;background:#edf3fb;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
    body::before{content:"";position:fixed;inset:-20vh -10vw;background:radial-gradient(circle at 12% 18%,rgba(47,111,237,.18),transparent 30%),radial-gradient(circle at 88% 72%,rgba(23,156,116,.14),transparent 32%),linear-gradient(135deg,#f9fbff,#e8f0fb 48%,#f7faf6);z-index:-2}
    .slide{display:none;min-height:100vh;padding:clamp(28px,5vw,72px);position:relative}
    .slide.active{display:grid;place-items:center}
    .slide__body{width:min(1120px,100%);min-height:min(680px,84vh);display:flex;flex-direction:column;justify-content:center;border:1px solid rgba(18,32,51,.08);border-radius:30px;background:rgba(255,255,255,.86);box-shadow:0 28px 80px rgba(35,55,88,.16);padding:clamp(34px,6vw,72px);position:relative;overflow:hidden}
    .slide__body::after{content:"";position:absolute;right:-80px;top:-90px;width:300px;height:300px;border:42px solid rgba(47,111,237,.08);border-radius:50%}
    .slide__chrome{position:absolute;left:clamp(28px,5vw,72px);right:clamp(28px,5vw,72px);top:24px;display:flex;align-items:center;justify-content:space-between;color:#55708d;font-size:13px;letter-spacing:.08em;text-transform:uppercase;z-index:3}
    .slide__chrome strong{font-size:14px;color:#1e3858}
    .kicker{margin:0 0 18px;color:var(--blue);font-size:18px;font-weight:700}
    h1{max-width:920px;margin:0;font-size:clamp(42px,6vw,78px);line-height:1.04;font-weight:800;letter-spacing:0}
    .content-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:48px}
    .point{min-height:152px;border:1px solid var(--line);border-radius:20px;background:#fff;padding:22px;box-shadow:0 16px 36px rgba(51,70,98,.08)}
    .point span{display:inline-flex;height:30px;min-width:38px;align-items:center;justify-content:center;border-radius:999px;background:#eef4ff;color:var(--blue);font-weight:800;font-size:13px}
    .point p{margin:18px 0 0;color:#25364a;font-size:22px;line-height:1.45;font-weight:650}
    .point--green span{background:#e9f8f2;color:var(--green)}
    .point--amber span{background:#fff4df;color:var(--amber)}
    .point--violet span{background:#f0edff;color:var(--violet)}
    .note{max-width:780px;margin:34px 0 0;color:var(--muted);font-size:17px;line-height:1.7}
    .cover .slide__body{background:linear-gradient(135deg,#ffffff 0%,#f6fbff 54%,#edf7f2 100%)}
    .cover h1{font-size:clamp(54px,7vw,92px)}
    .controls{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;border:1px solid rgba(18,32,51,.08);border-radius:999px;background:rgba(255,255,255,.82);padding:8px;box-shadow:0 18px 44px rgba(35,55,88,.16);backdrop-filter:blur(16px)}
    button{height:38px;border:0;border-radius:999px;background:#122033;color:#fff;padding:0 16px;font-weight:700;cursor:pointer}
    button.secondary{background:#eef4ff;color:#255ed6}
    .progress{position:fixed;left:0;right:0;bottom:0;height:5px;background:rgba(18,32,51,.08)}
    .bar{height:100%;width:0;background:linear-gradient(90deg,var(--blue),var(--green));transition:width .25s ease}
    @media (max-width:800px){body{overflow:auto}.slide{padding:70px 16px 88px}.slide__body{min-height:calc(100vh - 158px);border-radius:22px;padding:30px 22px}.content-grid{grid-template-columns:1fr;margin-top:30px}.point{min-height:auto}.point p{font-size:18px}.slide__chrome{left:18px;right:18px}.controls{bottom:16px}}
  </style>
</head>
<body>
${htmlSlides}
<div class="controls" aria-label="课件控制">
  <button class="secondary" type="button" data-prev>上一页</button>
  <button type="button" data-next>下一页</button>
</div>
<div class="progress" aria-hidden="true"><div class="bar"></div></div>
<script>
let current = 0;
const slides = [...document.querySelectorAll(".slide")];
const bar = document.querySelector(".bar");
function show(index){
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => slide.classList.toggle("active", i === current));
  if (bar) bar.style.width = ((current + 1) / slides.length * 100) + "%";
}
document.querySelector("[data-next]")?.addEventListener("click", () => show(current + 1));
document.querySelector("[data-prev]")?.addEventListener("click", () => show(current - 1));
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === " ") show(current + 1);
  if (event.key === "ArrowLeft") show(current - 1);
  if (event.key === "Home") show(0);
  if (event.key === "End") show(slides.length - 1);
});
show(0);
</script>
</body>
</html>`,
    slideCount: slides.length,
    theme,
    generatedAt: new Date().toISOString()
  };
}

function generateHtmlCourseware(input: GenerateCourseAiArtifactInput): HtmlCoursewarePayload {
  return renderFallbackHtmlCourseware(input);
}

export async function generateHtmlCoursewareWithAi(input: GenerateCourseAiArtifactInput): Promise<HtmlCoursewarePayload> {
  const fallback = renderFallbackHtmlCourseware(input);
  const config = resolveAiModelConfig();
  if (!config) return fallback;

  const source = {
    courseTitle: input.courseTitle,
    prompt: input.prompt,
    chapters: input.chapters,
    fallbackSlidePlan: htmlCoursewareSlides(input)
  };

  try {
    const raw = await createJsonCompletion({
      model: config.model,
      system: "你是资深课程视觉设计师和前端工程师。你只输出 JSON 对象，不输出 Markdown。",
      user: [
        "请基于课程结构生成一个可直接放入 iframe srcDoc 的完整 HTML 课件。",
        "输出 JSON 字段：html:string, slideCount:number, theme:string。",
        "HTML 必须包含 <!doctype html>、内联 CSS、内联 JS，不得引用外部图片、字体、脚本、样式或网络资源。",
        "视觉要求：有明确版式系统、层级、留白、色彩、进度条和播放控制；不要只是标题加列表；适合中文课堂投屏。",
        "交互要求：支持 ArrowRight、ArrowLeft、空格、Home、End；每页全屏展示；移动端不溢出。",
        "安全要求：不要生成 iframe、object、embed、form、外链跳转或远程资源。",
        "课程数据：",
        JSON.stringify(source)
      ].join("\n")
    });
    if (!raw) return fallback;

    const parsed = JSON.parse(extractJsonText(raw)) as Partial<HtmlCoursewarePayload>;
    const html = typeof parsed.html === "string" ? stripUnsafeHtml(parsed.html) : "";
    const slideCount = Number(parsed.slideCount);
    if (!/<!doctype html>/i.test(html) || !html.includes("ArrowRight") || !Number.isFinite(slideCount) || slideCount < 1) {
      return fallback;
    }

    return {
      html,
      slideCount,
      theme: typeof parsed.theme === "string" && parsed.theme.trim() ? parsed.theme.trim() : fallback.theme,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("[ai] html courseware generation failed:", safeAiErrorMessage(error));
    return fallback;
  }
}

export function generateCourseAiArtifact(input: GenerateCourseAiArtifactInput): CourseAiArtifactPayload {
  switch (input.appType) {
    case "question_generation":
      return generateQuestions(input);
    case "lesson_plan":
      return generateLessonPlan(input);
    case "courseware":
      return generateCourseware(input);
    case "paper_assembly":
      return generatePaper(input);
    case "html_courseware":
      return generateHtmlCourseware(input);
    default: {
      const exhaustive: never = input.appType;
      throw new Error(`不支持的 AI 应用类型：${exhaustive}`);
    }
  }
}
