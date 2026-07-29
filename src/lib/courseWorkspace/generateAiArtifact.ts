import { z } from "zod";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createJsonCompletion, createTextCompletion, resolveAiModelConfig } from "@/lib/ai/modelClient";
import type { CourseAiContext } from "@/lib/courseWorkspace/buildAiContext";
import {
  aiCoursewarePayloadSchema,
  aiLessonPlanPayloadSchema,
  aiPaperPayloadSchema,
  aiQuestionPayloadSchema,
  htmlCoursewarePayloadSchema,
  type AiCoursewarePayload,
  type AiLessonPlanPayload,
  type CourseAiAppType,
  type CourseAiArtifactPayload,
  type HtmlCoursewarePayload
} from "@/types/courseWorkspace";

type ChapterInput = {
  title: string;
  lessons: Array<{ title: string; summary?: string | null }>;
};

export type ApprovedQuestionInput = {
  id: string;
  type?: "single_choice" | "multiple_choice" | "short_answer";
  stem?: string;
};

export type GenerateCourseAiArtifactInput = {
  appType: CourseAiAppType;
  courseTitle?: string;
  chapters?: ChapterInput[];
  context?: CourseAiContext;
  prompt?: string;
  approvedQuestions?: ApprovedQuestionInput[];
  sourceCourseware?: AiCoursewarePayload;
  sourceLessonPlan?: AiLessonPlanPayload;
  sourceSnapshot?: unknown;
};

const htmlEnvelopeSchema = z.object({
  html: htmlCoursewarePayloadSchema.shape.html,
  theme: htmlCoursewarePayloadSchema.shape.theme
}).passthrough();

export const HTML_COURSEWARE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

const HTML_UI_TEXT_ALLOWLIST = ["上一页", "下一页", "首页", "末页", "播放", "暂停"] as const;

const outputInstructions: Record<CourseAiAppType, string> = {
  question_generation:
    '输出 {"questions":[{"type":"single_choice|multiple_choice|short_answer","stem":"...","options":["..."],"answer":"...","explanation":"..."}]}。选择题必须有至少两个选项；简答题不得输出 options 字段；answer 始终是字符串，多选答案用逗号连接，不得输出数组。',
  lesson_plan:
    '输出 {"objectives":["..."],"keyPoints":["..."],"teachingProcess":[{"phase":"...","minutes":10,"activity":"..."}],"assessment":["..."]}。',
  courseware:
    '输出 {"slides":[{"title":"...","bullets":["..."],"speakerNotes":"..."}]}，页数不超过 50。每页必须恰好输出 3 个 bullets；每个 bullet 是不超过 28 个汉字的单句短标题，不得换行；解释、案例和补充细节全部放入 speakerNotes。',
  ppt_courseware:
    '输出 {"slides":[{"title":"...","bullets":["..."],"speakerNotes":"..."}]}，页数不超过 50。每页必须恰好输出 3 个 bullets；每个 bullet 是不超过 28 个汉字的单句短标题，不得换行；解释、案例和补充细节全部放入 speakerNotes。',
  paper_assembly:
    '输出 {"title":"...","sections":[{"name":"...","score":20,"questionIds":["..."]}]}。questionIds 只能使用课程数据中 approvedQuestions 的 id，不得发明题目。',
  html_courseware:
    '生成含 doctype、html、head、body 的完整 HTML 文档。教学区只能逐字使用 sourceCourseware 中的唯一占位符，每个占位符必须在 body 标签文本节点中恰好出现一次；不得输出占位符代表的原文或任何其他教学文字。只能使用内联 CSS/JS，不得使用 iframe、object、embed、form、事件处理器属性、javascript URL 或任何远程资源。'
};

function extractJsonText(raw: string) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

function invalidOutput(message: string) {
  return new AiServiceError("MODEL_INVALID_OUTPUT", `AI 返回内容无效：${message}`);
}

function parseJson(raw: string | null) {
  if (!raw?.trim()) throw invalidOutput("模型未返回内容");

  try {
    return JSON.parse(extractJsonText(raw)) as unknown;
  } catch {
    throw invalidOutput("无法解析 JSON");
  }
}

function extractHtmlDocument(raw: string) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() ?? trimmed;
  const start = fenced.search(/<!doctype\s+html\b/i);
  const closingTags = Array.from(fenced.matchAll(/<\/html\s*>/gi));
  const end = closingTags.at(-1);
  return start >= 0 && end?.index !== undefined
    ? fenced.slice(start, end.index + end[0].length).trim()
    : null;
}

function parseHtmlModelOutput(raw: string | null) {
  if (!raw?.trim()) throw invalidOutput("模型未返回内容");

  try {
    const envelope = htmlEnvelopeSchema.safeParse(JSON.parse(extractJsonText(raw)));
    if (envelope.success) return envelope.data;
  } catch {
    // Older and partially compatible providers may ignore JSON mode. Raw HTML is the stable contract.
  }

  const html = extractHtmlDocument(raw);
  if (!html) throw invalidOutput("未返回完整 HTML 文档");
  return { html };
}

function normalizeQuestionModelPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.questions)) return value;

  return {
    ...payload,
    questions: payload.questions.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const question = { ...(item as Record<string, unknown>) };
      if (question.type === "short_answer" && Array.isArray(question.options) && question.options.length === 0) {
        delete question.options;
      }
      if (
        question.type === "multiple_choice"
        && Array.isArray(question.answer)
        && question.answer.length > 0
        && question.answer.every((answer) => typeof answer === "string" && answer.trim().length > 0)
      ) {
        question.answer = question.answer.join(", ");
      }
      return question;
    })
  };
}

type HtmlSourceToken = {
  token: string;
  value: string;
};

function buildHtmlSourceTokenContract(sourceCourseware: AiCoursewarePayload) {
  const replacements: HtmlSourceToken[] = [];
  const slides = sourceCourseware.slides.map((slide, slideIndex) => {
    const number = slideIndex + 1;
    const title = `{{SLIDE_${number}_TITLE}}`;
    const speakerNotes = `{{SLIDE_${number}_SPEAKER_NOTES}}`;
    const bullets = slide.bullets.map((_bullet, bulletIndex) => `{{SLIDE_${number}_BULLET_${bulletIndex + 1}}}`);

    replacements.push({ token: title, value: slide.title });
    bullets.forEach((token, bulletIndex) => replacements.push({ token, value: slide.bullets[bulletIndex] }));
    replacements.push({ token: speakerNotes, value: slide.speakerNotes });
    return { title, bullets, speakerNotes };
  });

  return { promptValue: { slides }, replacements };
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => namedEntities[name.toLowerCase()] ?? match);
}

function normalizeVisibleText(value: string) {
  return decodeHtmlEntities(value).normalize("NFKC").replace(/\s+/g, " ").trim();
}

function getVisibleBodyTextSegments(html: string) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "";
  return body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .split(/<[^>]+>/g)
    .map(normalizeVisibleText)
    .filter(Boolean);
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAllowedHtmlUiText(value: string) {
  if (!value) return true;
  if ((HTML_UI_TEXT_ALLOWLIST as readonly string[]).includes(value)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(value)) return true;
  return /^第\s*\d+\s*页\s*\/\s*共\s*\d+\s*页$/.test(value);
}

function validateAndReplaceSourceTokens(html: string, sourceCourseware: AiCoursewarePayload) {
  const { replacements } = buildHtmlSourceTokenContract(sourceCourseware);
  const expectedTokens = new Set(replacements.map(({ token }) => token));
  const detectedTokens = html.match(/\{\{SLIDE_\d+_(?:TITLE|BULLET_\d+|SPEAKER_NOTES)\}\}/g) ?? [];
  if (detectedTokens.some((token) => !expectedTokens.has(token))) {
    throw invalidOutput("HTML 包含未知的来源课件占位符");
  }

  const nonVisibleRegions = [
    ...(html.match(/<!--[\s\S]*?-->/g) ?? []),
    ...(html.match(/<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)\s*>/gi) ?? []),
    ...(html.match(/<[^>]+>/g) ?? [])
  ].join("\n");
  const visibleSegments = getVisibleBodyTextSegments(html);

  for (const { token } of replacements) {
    if (html.split(token).length - 1 !== 1) {
      throw invalidOutput("来源课件占位符缺失或重复");
    }
    if (nonVisibleRegions.includes(token) || !visibleSegments.some((segment) => segment.includes(token))) {
      throw invalidOutput("来源课件占位符必须位于 body 标签文本节点中");
    }
  }

  for (const segment of visibleSegments) {
    const remainingText = normalizeVisibleText(
      replacements.reduce((value, { token }) => value.split(token).join(""), segment)
    );
    if (!isAllowedHtmlUiText(remainingText)) {
      throw invalidOutput("HTML 包含来源课件之外的可见文字");
    }
  }

  const escapedSourceByToken = new Map(
    replacements.map(({ token, value }) => [token, escapeHtmlText(value)])
  );
  return html.replace(
    /\{\{SLIDE_\d+_(?:TITLE|BULLET_\d+|SPEAKER_NOTES)\}\}/g,
    (token) => escapedSourceByToken.get(token) ?? token
  );
}

function injectFixedCsp(html: string) {
  return html.replace(
    /<head\b([^>]*)>/i,
    `<head$1><meta http-equiv="Content-Security-Policy" content="${HTML_COURSEWARE_CSP}">`
  );
}

function validateHtmlDocument(html: string) {
  const completeDocument = /^\s*<!doctype\s+html\b[^>]*>/i.test(html)
    && /<html\b[^>]*>/i.test(html)
    && /<head\b[^>]*>[\s\S]*<\/head\s*>/i.test(html)
    && /<body\b[^>]*>[\s\S]*<\/body\s*>/i.test(html)
    && /<\/html\s*>\s*$/i.test(html);
  if (!completeDocument) throw invalidOutput("HTML 必须是完整文档");

  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/<\s*(?:iframe|object|embed|form|base)\b/i, "HTML 包含禁止的嵌入、表单或 base 元素"],
    [/\s+on[a-z][\w:-]*\s*=/i, "HTML 包含事件处理器属性"],
    [/javascript\s*:/i, "HTML 包含 javascript URL"],
    [/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, "HTML 包含自动跳转"],
    [/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i, "HTML 不得覆盖服务端安全策略"],
    [/@import\b/i, "HTML 包含远程样式导入"],
    [/<script\b[^>]*\bsrc\s*=/i, "HTML 包含外部脚本"],
  ];

  for (const [pattern, message] of forbiddenPatterns) {
    if (pattern.test(html)) throw invalidOutput(message);
  }

  const resourceAttribute = /\b(?:src|href|xlink:href|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of html.matchAll(resourceAttribute)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!value.startsWith("#") && !/^data:image\//i.test(value)) {
      throw invalidOutput("HTML 包含非白名单资源或跳转地址");
    }
  }

  const cssUrl = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi;
  for (const match of html.matchAll(cssUrl)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!/^data:image\//i.test(value)) throw invalidOutput("HTML 样式包含非白名单资源");
  }

  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi), (match) => match[1]).join("\n");
  const forbiddenScriptCapabilities: Array<[RegExp, string]> = [
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/i, "HTML 脚本包含网络请求能力"],
    [/navigator\s*\.\s*sendBeacon\b/i, "HTML 脚本包含网络请求能力"],
    [/\b(?:location|open|parent|top|opener)\b/i, "HTML 脚本包含跳转或父窗口访问能力"],
    [/document\s*\.\s*cookie\b/i, "HTML 脚本包含 Cookie 访问能力"],
    [/\b(?:localStorage|sessionStorage|indexedDB)\b/i, "HTML 脚本包含持久化存储能力"]
  ];
  for (const [pattern, message] of forbiddenScriptCapabilities) {
    if (pattern.test(scripts)) throw invalidOutput(message);
  }
}

function ensurePaperUsesApprovedQuestions(payload: z.infer<typeof aiPaperPayloadSchema>, input: GenerateCourseAiArtifactInput) {
  const approvedIds = new Set((input.approvedQuestions ?? []).map((question) => question.id));
  const referencedIds = payload.sections.flatMap((section) => section.questionIds);
  if (referencedIds.some((id) => !approvedIds.has(id))) {
    throw invalidOutput("试卷引用了未审核或不存在的题目");
  }
}

function parsePayload(input: GenerateCourseAiArtifactInput, raw: string | null): CourseAiArtifactPayload {
  try {
    if (input.appType === "html_courseware") {
      const parsed = parseHtmlModelOutput(raw);
      validateHtmlDocument(parsed.html);
      const htmlWithSourceText = validateAndReplaceSourceTokens(parsed.html, input.sourceCourseware!);
      return htmlCoursewarePayloadSchema.parse({
        ...parsed,
        html: injectFixedCsp(htmlWithSourceText),
        slideCount: input.sourceCourseware!.slides.length,
        generatedAt: new Date().toISOString()
      });
    }

    const json = parseJson(raw);

    switch (input.appType) {
      case "question_generation":
        return aiQuestionPayloadSchema.parse(normalizeQuestionModelPayload(json));
      case "lesson_plan":
        return aiLessonPlanPayloadSchema.parse(json);
      case "courseware":
      case "ppt_courseware":
        return aiCoursewarePayloadSchema.parse(json);
      case "paper_assembly": {
        const parsed = aiPaperPayloadSchema.parse(json);
        ensurePaperUsesApprovedQuestions(parsed, input);
        return parsed;
      }
      default: {
        const exhaustive: never = input.appType;
        throw invalidOutput(`不支持的 AI 应用类型：${exhaustive}`);
      }
    }
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    if (error instanceof z.ZodError) throw invalidOutput("字段缺失或格式不符合要求");
    throw error;
  }
}

export function buildCourseAiArtifactPrompt(input: GenerateCourseAiArtifactInput) {
  const htmlSource = input.appType === "html_courseware" && input.sourceCourseware
    ? buildHtmlSourceTokenContract(input.sourceCourseware).promptValue
    : undefined;
  return [
    input.appType === "html_courseware"
      ? "只输出一份完整 HTML 文档。首字符必须是 <!doctype html>，最后以 </html> 结束；不要输出 Markdown 代码围栏、JSON 或解释。"
      : "只输出一个 JSON 对象，不要输出 Markdown、解释或额外字段。",
    outputInstructions[input.appType],
    input.appType === "html_courseware" && input.sourceCourseware
      ? `不得输出真实教学文字。只能排版 sourceCourseware 占位符；每个占位符在 body 文本节点中恰好出现一次。额外可见文案仅允许：${HTML_UI_TEXT_ALLOWLIST.join("、")}，以及纯页码和标点。`
      : "",
    "课程数据：",
    JSON.stringify(input.appType === "html_courseware"
      ? { prompt: input.prompt, sourceCourseware: htmlSource }
      : {
          ...(input.context
            ? { context: input.context, sourceLessonPlan: input.sourceLessonPlan, sourceSnapshot: input.sourceSnapshot }
            : { courseTitle: input.courseTitle, chapters: input.chapters, prompt: input.prompt }),
          approvedQuestions: input.appType === "paper_assembly" ? input.approvedQuestions ?? [] : undefined
        })
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateCourseAiArtifact(input: GenerateCourseAiArtifactInput): Promise<CourseAiArtifactPayload> {
  if (input.appType === "html_courseware" && !input.sourceCourseware) {
    throw invalidOutput("必须提供已审核的来源课件");
  }

  const config = resolveAiModelConfig();
  if (!config) throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型未配置，请先联系管理员完成配置");

  const prompt = buildCourseAiArtifactPrompt(input);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const completion = input.appType === "html_courseware" ? createTextCompletion : createJsonCompletion;
      const raw = await completion({
        model: config.model,
        system: input.appType === "html_courseware"
          ? "你是互动课件前端生成助手。你必须严格遵守 HTML 输出契约和输入数据边界。"
          : "你是课程教学内容生成助手。你必须严格遵守输出 JSON 契约和输入数据边界。",
        user: attempt === 0
          ? prompt
          : input.appType === "html_courseware"
            ? `${prompt}\n上一次输出未通过 HTML 契约校验。请重新生成完整文档，逐项核对全部占位符、标签闭合和安全限制。`
            : `${prompt}\n上一次输出未通过 JSON 契约校验。请重新生成完整 JSON，逐项核对必填字段、字段类型和结尾括号。`
      });
      return parsePayload(input, raw);
    } catch (error) {
      const safe = toSafeAiError(error);
      if (safe.code !== "MODEL_INVALID_OUTPUT" || attempt === 1) throw safe;
    }
  }

  throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 返回内容无效，请重试");
}

export async function generateHtmlCoursewareWithAi(input: GenerateCourseAiArtifactInput): Promise<HtmlCoursewarePayload> {
  const payload = await generateCourseAiArtifact({ ...input, appType: "html_courseware" });
  return htmlCoursewarePayloadSchema.parse(payload);
}
