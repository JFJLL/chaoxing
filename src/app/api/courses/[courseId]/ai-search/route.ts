import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireCourseAccess } from "@/lib/permissions";
import { AiServiceError } from "@/lib/ai/errors";
import {
  BoundedJsonBodyError,
  readBoundedJsonBody
} from "@/lib/ai/requestGuards";
import { aiSearchRequestGuard } from "@/lib/ai/searchRequestGuard";
import { buildCourseKnowledgeSources } from "@/lib/courseWorkspace/courseKnowledgeSources";
import {
  MAX_COURSE_SEARCH_QUERY_LENGTH,
  searchCourseKnowledge
} from "@/lib/courseWorkspace/searchCourseKnowledge";

type RouteContext = { params: Promise<{ courseId: string }> };

const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(MAX_COURSE_SEARCH_QUERY_LENGTH)
}).strict();

const MAX_SEARCH_BODY_BYTES = 4_096;

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  let requestBody: unknown;
  try {
    requestBody = await readBoundedJsonBody(request, MAX_SEARCH_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonBodyError && error.reason === "too_large") {
      return NextResponse.json({
        code: "AI_SEARCH_BODY_TOO_LARGE",
        error: "AI 搜索请求内容过大",
        retryable: false
      }, { status: 413 });
    }
    return NextResponse.json({ code: "AI_SEARCH_QUERY_INVALID", error: "请输入 1 到 300 个字符的检索内容" }, { status: 400 });
  }
  const parsed = searchRequestSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json({ code: "AI_SEARCH_QUERY_INVALID", error: "请输入 1 到 300 个字符的检索内容" }, { status: 400 });
  }

  try {
    await requireCourseAccess(user, courseId);
  } catch {
    return NextResponse.json({ code: "FORBIDDEN", error: "无权访问课程" }, { status: 403 });
  }

  const lease = aiSearchRequestGuard.acquire(`${user.id}:${courseId}`);
  if (!lease.allowed) {
    return NextResponse.json({
      code: "AI_SEARCH_RATE_LIMITED",
      error: "AI 搜索请求过于频繁，请稍后重试",
      retryable: true
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(lease.retryAfterMs / 1_000))) }
    });
  }

  try {
    const sources = await buildCourseKnowledgeSources({ courseId, user });
    const results = await searchCourseKnowledge({ query: parsed.data.query, sources });
    return NextResponse.json({ query: parsed.data.query, results });
  } catch (error) {
    if (error instanceof AiServiceError) {
      return NextResponse.json({
        code: error.code,
        error: error.message,
        retryable: true
      }, { status: 503 });
    }
    throw error;
  } finally {
    lease.release();
  }
}
