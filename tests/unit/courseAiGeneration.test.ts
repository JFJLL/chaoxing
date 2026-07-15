import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCourseAiArtifact } from "../../src/lib/courseWorkspace/generateAiArtifact";
import type { CourseAiAppType } from "../../src/types/courseWorkspace";

const aiEnvNames = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "GEMINI_MODEL",
  "GEMINI_PROVIDER",
  "GOOGLE_API_KEY",
  "GOOGLE_BASE_URL",
  "GOOGLE_MODEL",
  "GOOGLE_PROVIDER",
  "GOOGLE_AI_BASE_URL",
  "GOOGLE_AI_MODEL",
  "GOOGLE_AI_PROVIDER",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "apiKey",
  "baseUrl",
  "model",
  "key",
  "url",
  "provider",
  "api_key",
  "base_url",
  "apiUrl",
  "api_url",
  "modelName",
  "model_name",
  "aiProvider",
  "geminiApiKey",
  "googleApiKey"
] as const;

const titleToken = "{{SLIDE_1_TITLE}}";
const bulletToken = "{{SLIDE_1_BULLET_1}}";
const notesToken = "{{SLIDE_1_SPEAKER_NOTES}}";

const safeHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>.slide{min-height:100vh}</style></head>
<body><section class="slide"><h1>${titleToken}</h1><p>${bulletToken}</p><aside>${notesToken}</aside></section><button>上一页</button><button>下一页</button><span>1 / 1</span><script>document.addEventListener("keydown", () => {});</script></body>
</html>`;

const fixedCsp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

const validPayloads = {
  question_generation: {
    questions: [
      {
        type: "single_choice",
        stem: "哪一项属于课程目标？",
        options: ["理解概念", "跳过练习"],
        answer: "A",
        explanation: "课程目标要求理解概念。"
      }
    ]
  },
  lesson_plan: {
    objectives: ["理解核心概念"],
    keyPoints: ["概念边界"],
    teachingProcess: [{ phase: "导入", minutes: 10, activity: "案例讨论" }],
    assessment: ["课堂问答"]
  },
  courseware: {
    slides: [{ title: "课程导入", bullets: ["学习目标"], speakerNotes: "介绍课程目标。" }]
  },
  paper_assembly: {
    title: "阶段测验",
    sections: [{ name: "单选题", score: 20, questionIds: ["question-1"] }]
  },
  html_courseware: {
    html: safeHtml,
    slideCount: 1,
    theme: "课堂蓝"
  }
} as const;

let previousEnv: Record<string, string | undefined>;

function clearAiEnv() {
  for (const name of aiEnvNames) delete process.env[name];
}

function modelResponse(payload: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] } }]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function mockModelOutput(payload: unknown, repeats = 2) {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  for (let index = 0; index < repeats; index += 1) {
    fetchMock.mockResolvedValueOnce(modelResponse(payload));
  }
  return fetchMock;
}

function inputFor(appType: CourseAiAppType) {
  return {
    appType,
    courseTitle: "数字阅读服务",
    chapters: [
      {
        title: "第一章 服务认知",
        lessons: [{ title: "读者需求", summary: "识别不同读者的需求。" }]
      }
    ],
    prompt: "面向新教师",
    approvedQuestions: [{ id: "question-1", type: "single_choice" as const, stem: "哪一项属于课程目标？" }],
    sourceCourseware: {
      slides: [{ title: "课程导入", bullets: ["学习目标"], speakerNotes: "介绍课程目标。" }]
    }
  };
}

beforeEach(() => {
  previousEnv = Object.fromEntries(aiEnvNames.map((name) => [name, process.env[name]]));
  clearAiEnv();
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-test";
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAiEnv();
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value !== undefined) process.env[name] = value;
  }
});

describe("strict course AI generation", () => {
  it.each(Object.entries(validPayloads))("parses valid %s model output", async (appType, payload) => {
    const fetchMock = mockModelOutput(payload);

    const result = await generateCourseAiArtifact(inputFor(appType as CourseAiAppType));

    expect(fetchMock).toHaveBeenCalledOnce();
    if (appType === "html_courseware") {
      expect(result).toMatchObject({
        slideCount: validPayloads.html_courseware.slideCount,
        theme: validPayloads.html_courseware.theme
      });
      expect(result).toHaveProperty("generatedAt", expect.any(String));
      expect(result).toHaveProperty("html", expect.stringContaining(fixedCsp));
      expect(result).toHaveProperty("html", expect.stringContaining("课程导入"));
      expect(result).toHaveProperty("html", expect.stringContaining("学习目标"));
      expect(result).not.toHaveProperty("html", expect.stringContaining(titleToken));
    } else {
      expect(result).toMatchObject(payload);
    }
  });

  it("normalizes common question-model variants before validating the stored contract", async () => {
    mockModelOutput({
      questions: [
        {
          type: "short_answer",
          stem: "简述公共文化服务的公益性。",
          options: [],
          answer: "以社会效益和公众基本文化权益为优先。",
          explanation: "考查公共文化服务的核心属性。"
        },
        {
          type: "multiple_choice",
          stem: "公共文化服务的特征包括哪些？",
          options: ["公益性", "均等性", "便利性", "营利优先"],
          answer: ["公益性", "均等性", "便利性"],
          explanation: "公共文化服务强调公益、均等和便利。"
        }
      ]
    });

    const result = await generateCourseAiArtifact(inputFor("question_generation"));

    expect(result).toEqual({
      questions: [
        {
          type: "short_answer",
          stem: "简述公共文化服务的公益性。",
          answer: "以社会效益和公众基本文化权益为优先。",
          explanation: "考查公共文化服务的核心属性。"
        },
        {
          type: "multiple_choice",
          stem: "公共文化服务的特征包括哪些？",
          options: ["公益性", "均等性", "便利性", "营利优先"],
          answer: "公益性, 均等性, 便利性",
          explanation: "公共文化服务强调公益、均等和便利。"
        }
      ]
    });
  });

  it("retries one invalid model response before failing the generation", async () => {
    const fetchMock = mockModelOutput("not-json", 1);
    fetchMock.mockResolvedValueOnce(modelResponse(validPayloads.question_generation));

    await expect(generateCourseAiArtifact(inputFor("question_generation"))).resolves.toMatchObject(
      validPayloads.question_generation
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects generation when no model is configured", async () => {
    clearAiEnv();

    await expect(generateCourseAiArtifact(inputFor("question_generation"))).rejects.toMatchObject({
      code: "MODEL_NOT_CONFIGURED"
    });
  });

  it.each(["", "not-json"])("rejects empty or invalid model output: %j", async (raw) => {
    mockModelOutput(raw);

    await expect(generateCourseAiArtifact(inputFor("question_generation"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it.each([
    ["question_generation", { questions: [{ type: "short_answer", stem: "说明概念", answer: "答案" }] }],
    [
      "lesson_plan",
      {
        objectives: ["理解概念"],
        keyPoints: ["概念"],
        teachingProcess: [{ phase: "导入", minutes: 0, activity: "讨论" }],
        assessment: ["问答"]
      }
    ],
    ["courseware", { slides: [{ title: "导入", bullets: [], speakerNotes: "说明" }] }],
    ["paper_assembly", { title: "测验", sections: [{ name: "单选题", score: -1, questionIds: ["question-1"] }] }],
    ["html_courseware", { html: safeHtml, slideCount: 0, theme: "课堂蓝" }]
  ] as const)("rejects invalid %s payload schema", async (appType, payload) => {
    mockModelOutput(payload);

    await expect(generateCourseAiArtifact(inputFor(appType))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("rejects paper question IDs that were not provided as approved", async () => {
    mockModelOutput({
      title: "阶段测验",
      sections: [{ name: "单选题", score: 20, questionIds: ["invented-question"] }]
    });

    await expect(generateCourseAiArtifact(inputFor("paper_assembly"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("rejects HTML generation without approved source courseware before calling the model", async () => {
    const fetchMock = mockModelOutput(validPayloads.html_courseware);
    const { sourceCourseware: _sourceCourseware, ...input } = inputFor("html_courseware");

    await expect(generateCourseAiArtifact(input)).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects HTML that omits a required source token", async () => {
    mockModelOutput({
      ...validPayloads.html_courseware,
      html: safeHtml.replace(bulletToken, "")
    });

    await expect(generateCourseAiArtifact(inputFor("html_courseware"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("rejects HTML that duplicates a source token", async () => {
    mockModelOutput({
      ...validPayloads.html_courseware,
      html: safeHtml.replace(`</h1>`, `${titleToken}</h1>`)
    });

    await expect(generateCourseAiArtifact(inputFor("html_courseware"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("rejects visible text outside source tokens and the fixed UI whitelist", async () => {
    mockModelOutput({
      ...validPayloads.html_courseware,
      html: safeHtml.replace("<body>", "<body><p>模型新增的教学结论</p>")
    });

    await expect(generateCourseAiArtifact(inputFor("html_courseware"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it.each([
    safeHtml.replace(`<h1>${titleToken}</h1>`, `<h1>课程标题</h1><script>const hidden = "${titleToken}";</script>`),
    safeHtml.replace(`<h1>${titleToken}</h1>`, `<h1>课程标题</h1><style>.x::after{content:"${titleToken}"}</style>`),
    safeHtml.replace(`<h1>${titleToken}</h1>`, `<h1 data-content="${titleToken}">课程标题</h1>`)
  ])("rejects a source token hidden outside a body text node", async (html) => {
    mockModelOutput({ ...validPayloads.html_courseware, html });

    await expect(generateCourseAiArtifact(inputFor("html_courseware"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("does not send source teaching text to the model", async () => {
    const fetchMock = mockModelOutput(validPayloads.html_courseware);

    await generateCourseAiArtifact(inputFor("html_courseware"));

    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(requestBody).toContain(titleToken);
    expect(requestBody).toContain(bulletToken);
    expect(requestBody).not.toContain("课程导入");
    expect(requestBody).not.toContain("学习目标");
    expect(requestBody).not.toContain("介绍课程目标");
  });

  it("HTML-escapes source text before replacing validated tokens", async () => {
    mockModelOutput(validPayloads.html_courseware);
    const input = inputFor("html_courseware");
    input.sourceCourseware.slides[0].title = '<script>alert("unsafe")</script> & 标题';

    const result = await generateCourseAiArtifact(input);
    const html = "html" in result ? result.html : "";

    expect(html).toContain("&lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt; &amp; 标题");
    expect(html).not.toContain('<script>alert("unsafe")</script>');
  });

  it("preserves source text that contains another valid token without cascading replacement", async () => {
    mockModelOutput(validPayloads.html_courseware);
    const input = inputFor("html_courseware");
    input.sourceCourseware.slides[0].title = `原样保留 ${notesToken}`;

    const result = await generateCourseAiArtifact(input);
    const html = "html" in result ? result.html : "";

    expect(html).toContain(`<h1>原样保留 ${notesToken}</h1>`);
    expect(html).toContain("<aside>介绍课程目标。</aside>");
  });

  it.each(["1+1=3", "2026：错误结论", "2026：1234！"])(
    "rejects non-page-number visible text composed from numbers or punctuation: %s",
    async (extraText) => {
      mockModelOutput({
        ...validPayloads.html_courseware,
        html: safeHtml.replace("<body>", `<body><p>${extraText}</p>`)
      });

      await expect(generateCourseAiArtifact(inputFor("html_courseware"))).rejects.toMatchObject({
        code: "MODEL_INVALID_OUTPUT"
      });
    }
  );

  it.each([
    safeHtml.replace("<body>", '<body><iframe src="about:blank"></iframe>'),
    safeHtml.replace("<body>", '<body><button onclick="alert(1)">下一页</button>'),
    safeHtml.replace("<body>", '<body><a href="javascript:alert(1)">下一页</a>'),
    safeHtml.replace("<body>", '<body><a href="https://example.com/lesson">课程资料</a>'),
    safeHtml.replace("<body>", '<body><a href="/lesson">课程资料</a>'),
    safeHtml.replace("<body>", '<body><base href="#slides">'),
    safeHtml.replace("</head>", '<link rel="stylesheet" href="https://example.com/theme.css"></head>'),
    safeHtml.replace("<body>", '<body><img src="//example.com/cover.png">'),
    safeHtml.replace("</style>", ".cover{background:url(#gradient)}</style>"),
    safeHtml.replace("document.addEventListener", "window.location.assign('https://example.com');document.addEventListener"),
    safeHtml.replace("document.addEventListener", "window.open('https://example.com');document.addEventListener"),
    safeHtml.replace("document.addEventListener", "parent.postMessage('content', '*');document.addEventListener"),
    safeHtml.replace("document.addEventListener", "document.cookie;localStorage.getItem('x');document.addEventListener")
  ])("rejects unsafe HTML courseware", async (html) => {
    mockModelOutput({ html, slideCount: 1, theme: "课堂蓝" });

    await expect(generateCourseAiArtifact(inputFor("html_courseware"))).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT"
    });
  });

  it("sanitizes provider errors without leaking credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Bearer secret-token failed; api_key=private-key; sk-1234567890")
    );

    const promise = generateCourseAiArtifact(inputFor("lesson_plan"));

    await expect(promise).rejects.toMatchObject({ code: "MODEL_REQUEST_FAILED" });
    await expect(promise).rejects.not.toThrow(/secret-token|private-key|sk-1234567890/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
