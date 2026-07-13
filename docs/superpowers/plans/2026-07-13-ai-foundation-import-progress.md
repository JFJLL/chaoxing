# AI Foundation and Document Import Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 文档建课补齐可自动更新的阶段进度，并建立“模型失败即失败、只允许重试”的统一错误基础。

**Architecture:** 保留现有文档导入队列和 `DocumentImportJob` 状态字段；新增纯函数描述阶段状态，新增客户端轮询组件读取现有任务查询接口。课程大纲生成移除确定性模板降级，通过统一的安全错误类型让任务进入 `FAILED`，原参数由现有重试接口复用。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Prisma 5、Vitest、Lucide React。

## Global Constraints

- 只修改 AI 基础错误协议和 AI 文档建课，不改其他业务模块。
- 不展示估算百分比；只展示真实任务阶段。
- 模型调用失败只提供重试，不生成本地模板。
- 不新增外部服务或前端依赖。
- 不执行外部模型 smoke test，除非用户另行授权。
- 不自动 commit；每个任务只形成可审查的工作树检查点。

---

## File Structure

- Create `src/lib/ai/errors.ts`: 定义可安全展示的 AI 错误代码和脱敏函数。
- Modify `src/lib/ai/generateCourseOutline.ts`: 移除模板降级，模型缺失或输出无效时抛出安全错误。
- Create `src/lib/imports/importProgress.ts`: 集中维护导入阶段顺序、终态和显示状态。
- Create `src/components/ai-import/ImportProgressClient.tsx`: 轮询任务状态并触发终态刷新。
- Modify `src/components/ai-import/ImportTimeline.tsx`: 展示完成、进行中、未开始、失败和排队位置。
- Modify `src/components/ai-import/UploadPanel.tsx`: 上传期间显示旋转圆圈并锁定表单。
- Modify `src/app/space/courses/[courseId]/ai-import/[jobId]/page.tsx`: 使用客户端实时进度组件。
- Modify `tests/unit/aiOutline.test.ts`: 把自动模板降级断言改成严格失败断言。
- Create `tests/unit/importProgress.test.ts`: 覆盖阶段映射、终态和排队文案。
- Create `tests/unit/importTimeline.test.tsx`: 通过服务端静态渲染验证进度图标和文本。

### Task 1: AI 安全错误协议

**Files:**
- Create: `src/lib/ai/errors.ts`
- Test: `tests/unit/aiErrors.test.ts`

**Interfaces:**
- Produces: `AiServiceError`, `toSafeAiError(error: unknown): AiServiceError`。
- `AiServiceError.code` 取值为 `MODEL_NOT_CONFIGURED | MODEL_TIMEOUT | MODEL_RATE_LIMITED | MODEL_INVALID_OUTPUT | MODEL_REQUEST_FAILED`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";

describe("AI errors", () => {
  it("redacts bearer tokens and query keys", () => {
    const error = toSafeAiError(new Error("Bearer secret-token https://api.test?q=1&api_key=secret"));
    expect(error.message).not.toContain("secret-token");
    expect(error.message).not.toContain("api_key=secret");
  });

  it("preserves an existing service error code", () => {
    const input = new AiServiceError("MODEL_TIMEOUT", "模型响应超时，请重试");
    expect(toSafeAiError(input)).toBe(input);
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `rtk npm test -- tests/unit/aiErrors.test.ts`

Expected: FAIL，提示无法解析 `@/lib/ai/errors`。

- [ ] **Step 3: 实现最小错误类型与脱敏**

```ts
export type AiErrorCode =
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_TIMEOUT"
  | "MODEL_RATE_LIMITED"
  | "MODEL_INVALID_OUTPUT"
  | "MODEL_REQUEST_FAILED";

export class AiServiceError extends Error {
  constructor(public readonly code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiServiceError";
  }
}

function redact(value: string) {
  return value
    .replace(/([?&](?:key|api_key|apiKey)=)[^&\s]+/gi, "$1***")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1***")
    .slice(0, 180);
}

export function toSafeAiError(error: unknown) {
  if (error instanceof AiServiceError) return error;
  return new AiServiceError(
    "MODEL_REQUEST_FAILED",
    `AI 服务调用失败：${redact(error instanceof Error ? error.message : "未知错误")}`
  );
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `rtk npm test -- tests/unit/aiErrors.test.ts`

Expected: 2 tests PASS。

- [ ] **Step 5: 检查工作树差异**

Run: `rtk git diff -- src/lib/ai/errors.ts tests/unit/aiErrors.test.ts`

Expected: 只有错误协议和对应测试；不执行 commit。

### Task 2: 移除课程大纲的本地模板降级

**Files:**
- Modify: `src/lib/ai/generateCourseOutline.ts`
- Modify: `tests/unit/aiOutline.test.ts`

**Interfaces:**
- Consumes: `AiServiceError`, `toSafeAiError`。
- Produces: `parseGeneratedOutline(raw, input): GeneratedCourseOutline`；`generateCourseOutline(input): Promise<{ outline: GeneratedCourseOutline }>`。

- [ ] **Step 1: 将无模型和无效输出测试改为严格失败**

```ts
it("rejects invalid model output instead of creating a local template", () => {
  expect(() => parseGeneratedOutline("not-json", outlineInput)).toThrowError(
    expect.objectContaining({ code: "MODEL_INVALID_OUTPUT" })
  );
});

it("rejects generation when no model is configured", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_API_KEY;
  await expect(generateCourseOutline(outlineInput)).rejects.toMatchObject({
    code: "MODEL_NOT_CONFIGURED"
  });
});
```

- [ ] **Step 2: 运行严格失败测试，确认旧实现仍返回模板导致失败**

Run: `rtk npm test -- tests/unit/aiOutline.test.ts`

Expected: FAIL，旧的 `parseOutlineOrFallback`/`generateCourseOutline` 返回 fallback 而不是抛错。

- [ ] **Step 3: 删除 `createFallbackOutline` 和 fallback 分支**

`parseGeneratedOutline` 只接受直接 schema 校验成功或可规范化成功的模型 JSON；否则执行：

```ts
throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 返回的课程目录格式无效，请重试");
```

模型未配置时执行：

```ts
throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型未配置，请联系管理员检查模型设置");
```

模型请求异常时执行：

```ts
throw toSafeAiError(error);
```

- [ ] **Step 4: 运行大纲测试**

Run: `rtk npm test -- tests/unit/aiOutline.test.ts`

Expected: 全部 PASS，且不存在任何 fallback 断言。

- [ ] **Step 5: 运行导入管线回归测试**

Run: `rtk npm test -- tests/unit/importPipeline.test.ts`

Expected: 全部 PASS；若测试依赖 fallback，则改为注入有效模型输出或断言任务进入 `FAILED`，不得恢复模板。

### Task 3: 导入阶段领域模型

**Files:**
- Create: `src/lib/imports/importProgress.ts`
- Test: `tests/unit/importProgress.test.ts`

**Interfaces:**
- Produces: `IMPORT_STEPS`, `ImportStepState`, `getImportStepStates(status)`, `isImportTerminal(status)`, `getQueueLabel(jobsAhead)`。

- [ ] **Step 1: 写阶段映射失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getImportStepStates, getQueueLabel, isImportTerminal } from "@/lib/imports/importProgress";

describe("import progress", () => {
  it("marks only earlier stages complete and the current stage active", () => {
    expect(getImportStepStates("STRUCTURING").map((step) => step.state)).toEqual([
      "complete", "complete", "active", "pending", "pending", "pending"
    ]);
  });

  it("recognizes terminal statuses", () => {
    expect(isImportTerminal("READY_FOR_REVIEW")).toBe(true);
    expect(isImportTerminal("APPLIED")).toBe(true);
    expect(isImportTerminal("FAILED")).toBe(true);
    expect(isImportTerminal("MAPPING")).toBe(false);
  });

  it("describes the number of jobs ahead", () => {
    expect(getQueueLabel(1)).toBe("前方还有 1 个任务");
    expect(getQueueLabel(null)).toBe("等待系统处理");
  });
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `rtk npm test -- tests/unit/importProgress.test.ts`

Expected: FAIL，无法解析新模块。

- [ ] **Step 3: 实现阶段常量和纯函数**

阶段顺序固定为 `QUEUED, EXTRACTING, STRUCTURING, MAPPING, READY_FOR_REVIEW, APPLIED`。`GENERATING` 兼容映射到 `STRUCTURING`。当前阶段为 `active`，之前为 `complete`，之后为 `pending`；`FAILED` 保留单独错误视图。

- [ ] **Step 4: 运行测试并确认通过**

Run: `rtk npm test -- tests/unit/importProgress.test.ts`

Expected: 3 tests PASS。

### Task 4: 可区分当前阶段的进度展示

**Files:**
- Modify: `src/components/ai-import/ImportTimeline.tsx`
- Create: `tests/unit/importTimeline.test.tsx`

**Interfaces:**
- Consumes: `getImportStepStates`, `getQueueLabel`。
- `ImportTimeline` 新增可选参数 `currentStage?: string | null`、`jobsAhead?: number | null`、`pollError?: string`。

- [ ] **Step 1: 写静态渲染失败测试**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";

it("renders the active stage and jobs ahead", () => {
  const html = renderToStaticMarkup(
    <ImportTimeline status="QUEUED" currentStage="等待处理" jobsAhead={2} />
  );
  expect(html).toContain("等待处理");
  expect(html).toContain("前方还有 2 个任务");
  expect(html).toContain("animate-spin");
});
```

- [ ] **Step 2: 运行测试并确认旧组件不满足断言**

Run: `rtk npm test -- tests/unit/importTimeline.test.tsx`

Expected: FAIL，缺少队列文案、当前阶段和旋转图标。

- [ ] **Step 3: 更新组件**

完成阶段使用 `CheckCircle2`，当前阶段使用 `Loader2 className="... animate-spin"`，未开始阶段使用 `Circle`。`FAILED` 继续显示 `XCircle` 和后端错误；`pollError` 以非终止的橙色提示显示。

- [ ] **Step 4: 运行组件测试**

Run: `rtk npm test -- tests/unit/importTimeline.test.tsx`

Expected: PASS。

### Task 5: 任务详情自动轮询

**Files:**
- Create: `src/components/ai-import/ImportProgressClient.tsx`
- Modify: `src/app/space/courses/[courseId]/ai-import/[jobId]/page.tsx`
- Test: `tests/unit/importProgress.test.ts`

**Interfaces:**
- Consumes: `isImportTerminal`, `ImportTimeline`。
- `ImportProgressClient` props: `{ jobId, initialStatus, initialCurrentStage, initialJobsAhead, initialErrorMessage, retryHref }`。

- [ ] **Step 1: 补充轮询决策测试**

```ts
expect(getNextPollDelay("QUEUED")).toBe(1500);
expect(getNextPollDelay("MAPPING")).toBe(1500);
expect(getNextPollDelay("READY_FOR_REVIEW")).toBeNull();
expect(getNextPollDelay("FAILED")).toBeNull();
```

- [ ] **Step 2: 运行测试并确认 `getNextPollDelay` 不存在**

Run: `rtk npm test -- tests/unit/importProgress.test.ts`

Expected: FAIL，缺少导出函数。

- [ ] **Step 3: 实现轮询决策并创建客户端组件**

组件用 `setTimeout` 每 1500ms 请求 `/api/ai-import/${jobId}`。成功后更新 `status/currentStage/jobsAhead/errorMessage`；进入终态时取消后续定时器并执行 `router.refresh()`。单次请求失败设置“状态更新失败，正在重试”，下一次成功时清除。effect cleanup 必须取消定时器和在途更新。

- [ ] **Step 4: 替换任务页的静态时间线**

```tsx
<ImportProgressClient
  jobId={job.id}
  initialStatus={job.status}
  initialCurrentStage={job.currentStage}
  initialJobsAhead={null}
  initialErrorMessage={job.errorMessage}
  retryHref={`/space/courses/${courseId}/ai-import`}
/>
```

- [ ] **Step 5: 运行相关测试和类型检查**

Run: `rtk npm test -- tests/unit/importProgress.test.ts tests/unit/importTimeline.test.tsx`

Expected: 全部 PASS。

Run: `rtk npm run typecheck`

Expected: exit 0。

### Task 6: 上传按钮加载反馈

**Files:**
- Modify: `src/components/ai-import/UploadPanel.tsx`

**Interfaces:**
- Consumes: `Loader2` from `lucide-react`、`getUploadButtonLabel(submitting)` from `src/lib/imports/importProgress.ts`。

- [ ] **Step 1: 为上传按钮文案写失败测试**

在 `tests/unit/importProgress.test.ts` 中先写：

```ts
expect(getUploadButtonLabel(false)).toBe("提交解析任务");
expect(getUploadButtonLabel(true)).toBe("正在上传文档");
```

- [ ] **Step 2: 运行测试并确认新接口不存在**

Run: `rtk npm test -- tests/unit/importProgress.test.ts`

Expected: FAIL，缺少 `getUploadButtonLabel`。

- [ ] **Step 3: 在 `importProgress.ts` 实现文案函数并更新上传面板**

```ts
export function getUploadButtonLabel(submitting: boolean) {
  return submitting ? "正在上传文档" : "提交解析任务";
}
```

提交中按钮渲染：

```tsx
<Loader2 className="h-4 w-4 animate-spin" />
正在上传文档
```

文件 input 和按钮保持 `disabled={submitting}`，请求失败后 `finally` 恢复状态，网络异常也必须显示“上传失败，请重试”。

- [ ] **Step 4: 运行测试和类型检查**

Run: `rtk npm test -- tests/unit/importProgress.test.ts`

Expected: PASS。

Run: `rtk npm run typecheck`

Expected: exit 0。

### Task 7: 完整回归验证

**Files:**
- Verify only; no new production files。

- [ ] **Step 1: 检查不存在模板降级文本和调用**

Run: `rtk rg -n "createFallbackOutline|parseOutlineOrFallback|已使用本地确定性|本地模板" src tests`

Expected: 无匹配；设计文档中的禁止性描述不在本命令扫描范围。

- [ ] **Step 2: 运行完整单元测试**

Run: `rtk npm test`

Expected: 所有测试文件 PASS，0 failed。

- [ ] **Step 3: 运行类型检查**

Run: `rtk npm run typecheck`

Expected: exit 0。

- [ ] **Step 4: 运行生产构建**

Run: `rtk npm run build`

Expected: `Compiled successfully` 且 exit 0。

- [ ] **Step 5: 审查最终差异**

Run: `rtk git diff --check`

Expected: 无空白错误。

Run: `rtk git status --short`

Expected: 只包含本计划文件、总体设计文件、进度子规格和本计划列出的实现/测试文件；保留用户原有未跟踪 DOCX，不纳入任务。
