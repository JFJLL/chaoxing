"use client";

import { useRef, useState } from "react";
import { FileSearch, Loader2, RefreshCw, Search, Wand2 } from "lucide-react";

const sourceTypeLabels = {
  course: "课程",
  chapter: "课程章节",
  lesson: "课程课时",
  resource: "课程资料",
  announcement: "课程公告",
  import: "导入文档",
  question: "课程题目",
  ai_artifact: "AI 产物"
} as const;

export type AiCourseSearchResult = {
  id: string;
  type: keyof typeof sourceTypeLabels;
  label: string;
  snippet: string;
  href: string;
};

export type AiCourseSearchState =
  | { status: "idle"; results: AiCourseSearchResult[] }
  | { status: "loading"; results: AiCourseSearchResult[] }
  | { status: "success"; results: AiCourseSearchResult[] }
  | { status: "error"; results: AiCourseSearchResult[]; error: string };

type RequestLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class AiCourseSearchRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCourseSearchRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseResult(value: unknown, courseId: string): AiCourseSearchResult | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (
    typeof value.id !== "string" || !value.id
    || typeof type !== "string" || !(type in sourceTypeLabels)
    || typeof value.label !== "string" || !value.label
    || typeof value.snippet !== "string" || !value.snippet
    || typeof value.href !== "string" || !value.href.startsWith(`/space/courses/${courseId}/`)
  ) return null;
  return {
    id: value.id,
    type: type as AiCourseSearchResult["type"],
    label: value.label,
    snippet: value.snippet,
    href: value.href
  };
}

const safeErrorCodes = new Set([
  "AI_SEARCH_QUERY_INVALID",
  "AI_SEARCH_RATE_LIMITED",
  "AI_SEARCH_BODY_TOO_LARGE",
  "MODEL_NOT_CONFIGURED",
  "MODEL_TIMEOUT",
  "MODEL_RATE_LIMITED",
  "MODEL_INVALID_OUTPUT",
  "MODEL_REQUEST_FAILED",
  "FORBIDDEN"
]);

export async function requestCourseKnowledgeSearch(
  courseId: string,
  query: string,
  request: RequestLike = fetch
) {
  let response: Response;
  try {
    response = await request(`/api/courses/${courseId}/ai-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
  } catch {
    throw new AiCourseSearchRequestError("网络连接失败，请重试");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const safeBody = isRecord(body) ? body : null;
    const message = typeof safeBody?.code === "string"
      && safeErrorCodes.has(safeBody.code)
      && typeof safeBody.error === "string"
      && safeBody.error.trim()
      ? safeBody.error
      : "AI 调用失败，请重试";
    throw new AiCourseSearchRequestError(message);
  }
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new AiCourseSearchRequestError("AI 返回结果无效，请重试");
  }
  const results = body.results.map((result) => parseResult(result, courseId));
  if (results.some((result) => result === null)) {
    throw new AiCourseSearchRequestError("AI 返回结果无效，请重试");
  }
  return results as AiCourseSearchResult[];
}

export function createSearchSubmissionLock() {
  let locked = false;
  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    }
  };
}

export function AiCourseSearchView({
  query,
  state,
  onQueryChange,
  onSubmit,
  onRetry
}: {
  query: string;
  state: AiCourseSearchState;
  onQueryChange: (query: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRetry: () => void;
}) {
  const loading = state.status === "loading";
  const showPanel = state.status !== "idle";

  return (
    <div className="relative max-w-xl flex-1 lg:max-w-md xl:max-w-lg">
      <form onSubmit={onSubmit} role="search" className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
        <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <label htmlFor="ai-course-search" className="sr-only">检索当前课程</label>
        <input
          id="ai-course-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          maxLength={300}
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:text-slate-400"
          placeholder="AI智能检索当前课程"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          aria-label={loading ? "正在检索当前课程" : "开始检索当前课程"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      {showPanel ? (
        <section aria-live="polite" className="absolute right-0 z-30 mt-3 w-full min-w-[min(92vw,420px)] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
          {loading ? <p role="status" className="flex items-center gap-2 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在检索当前课程</p> : null}
          {state.status === "error" ? (
            <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <p>{state.error}</p>
              <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1 font-medium underline underline-offset-4">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />重试
              </button>
            </div>
          ) : null}
          {state.status === "success" && state.results.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">当前课程中没有找到相关内容</p>
          ) : null}
          {state.status === "success" && state.results.length > 0 ? (
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              <p className="px-1 text-xs font-medium text-slate-400">找到 {state.results.length} 条当前课程内容</p>
              {state.results.map((result) => (
                <a key={result.id} href={result.href} className="block rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50">
                  <span className="flex items-center gap-2 text-xs text-blue-700"><FileSearch className="h-3.5 w-3.5" aria-hidden="true" />{sourceTypeLabels[result.type]}</span>
                  <span className="mt-1 block text-sm font-medium text-slate-900">{result.label}</span>
                  <span className="mt-1 line-clamp-3 block whitespace-pre-wrap text-xs leading-5 text-slate-600">{result.snippet}</span>
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function AiCourseSearch({ courseId }: { courseId: string }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<AiCourseSearchState>({ status: "idle", results: [] });
  const lock = useRef<ReturnType<typeof createSearchSubmissionLock> | null>(null);
  if (!lock.current) lock.current = createSearchSubmissionLock();

  async function runSearch() {
    if (!lock.current?.acquire()) return;
    const submittedQuery = query.trim();
    if (!submittedQuery) {
      lock.current?.release();
      return;
    }
    setState((current) => ({ status: "loading", results: current.results }));
    try {
      const results = await requestCourseKnowledgeSearch(courseId, submittedQuery);
      setState({ status: "success", results });
    } catch (error) {
      setState({
        status: "error",
        results: [],
        error: error instanceof Error && error.message ? error.message : "AI 调用失败，请重试"
      });
    } finally {
      lock.current?.release();
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  return <AiCourseSearchView query={query} state={state} onQueryChange={setQuery} onSubmit={submit} onRetry={() => void runSearch()} />;
}
