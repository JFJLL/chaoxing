import { ZoviiError, type ZoviiErrorCode } from "./errors";
import type { ZoviiTokenStore } from "./tokenStore";
import type {
  ZoviiAuthSession,
  ZoviiBalance,
  ZoviiMember,
  ZoviiMemberList,
  ZoviiSendCodeResult,
  ZoviiTokens,
  ZoviiUser
} from "./types";

export type ZoviiLogFn = (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;

export type ZoviiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: ZoviiLogFn;
};

const SENSITIVE_KEY = /password|code|token|secret|cookie|credential|authorization/i;

export function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : value;
  }
  return out;
}

type RequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  form?: Record<string, string>;
  accessToken?: string;
  timeoutMs?: number;
};

type RequestResult<T> = {
  data: T;
  requestId?: string;
  status: number;
};

function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.detail === "string") return record.detail;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.detail === "string") return nested.detail;
  }
  return "";
}

function classifyError(status: number, message: string): ZoviiErrorCode {
  const text = message.toLowerCase();
  if (status === 400) {
    if (/expired|过期/.test(text)) return "CODE_EXPIRED";
    if (/used|已使用|already used/.test(text)) return "CODE_USED";
    if (/invalid|incorrect|wrong|错误|不正确/.test(text) && /code|验证码/.test(text)) return "INVALID_CODE";
    return "INVALID_REQUEST";
  }
  if (status === 401) return "INVALID_CREDENTIALS";
  if (status === 403) return "ENTERPRISE_ACCESS_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409 || status === 422) {
    if (/not registered|未注册/.test(text)) return "PHONE_NOT_REGISTERED";
    if (/registered|exists|已注册|已存在/.test(text)) return "PHONE_ALREADY_REGISTERED";
    return "INVALID_REQUEST";
  }
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

function mapHttpError(status: number, body: unknown, requestId?: string): ZoviiError {
  const message = extractErrorMessage(body);
  const code = classifyError(status, message);
  return new ZoviiError(code, message || `Zovii HTTP ${status}`, {
    status,
    retryable: status >= 500 || status === 429,
    externalRequestId: requestId
  });
}

function normalizeTokens(data: Record<string, unknown>): ZoviiTokens {
  const accessToken = data.access_token ?? data.accessToken;
  const refreshToken = data.refresh_token ?? data.refreshToken;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new ZoviiError("UNAUTHORIZED", "Zovii auth response missing tokens", { status: 401 });
  }
  return {
    accessToken,
    refreshToken,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined
  };
}

function normalizeUser(data: Record<string, unknown>): ZoviiUser {
  const id = data.id ?? data.user_id ?? data.uid;
  if (typeof id !== "string" || !id) {
    throw new ZoviiError("UNAUTHORIZED", "Zovii auth response missing user id", { status: 401 });
  }
  return {
    id,
    phone: typeof data.phone === "string" ? data.phone : null,
    username: typeof data.username === "string" ? data.username : null,
    nickname: typeof data.nickname === "string" ? data.nickname : null,
    email: typeof data.email === "string" ? data.email : null,
    enterpriseId: typeof data.enterprise_id === "string" ? data.enterprise_id : null,
    enterpriseRole: typeof data.enterprise_role === "string" ? data.enterprise_role : null
  };
}

function normalizeAuthSession(data: unknown): ZoviiAuthSession {
  if (!data || typeof data !== "object") {
    throw new ZoviiError("UNAUTHORIZED", "Zovii auth response is empty", { status: 401 });
  }
  const record = data as Record<string, unknown>;
  const userData = (record.user && typeof record.user === "object" ? record.user : record) as Record<string, unknown>;
  return {
    user: normalizeUser(userData),
    tokens: normalizeTokens(record)
  };
}

function normalizeMember(data: Record<string, unknown>): ZoviiMember {
  // The revalidated Zovii contract identifies members by user_id for the
  // role/credits endpoints; prefer it over any other id fields.
  const id = data.user_id ?? data.id ?? data.member_id;
  if (typeof id !== "string") {
    throw new ZoviiError("INVALID_REQUEST", "Zovii member response missing id", { status: 400 });
  }
  return {
    id,
    userId: typeof data.user_id === "string" ? data.user_id : typeof data.userId === "string" ? data.userId : null,
    displayId: typeof data.display_id === "string" ? data.display_id : null,
    phone: typeof data.phone === "string" ? data.phone : null,
    name: typeof data.name === "string" ? data.name : typeof data.nickname === "string" ? data.nickname : null,
    username: typeof data.username === "string" ? data.username : null,
    role: typeof data.role === "string" ? data.role : null,
    status: typeof data.status === "string" ? data.status : null,
    credits: typeof data.credits === "number" ? data.credits : typeof data.credit === "number" ? data.credit : null,
    enterpriseBalance: typeof data.enterprise_balance === "number" ? data.enterprise_balance : null,
    consumption: typeof data.consumption === "number" ? data.consumption : null,
    callCount: typeof data.call_count === "number" ? data.call_count : null,
    joinedAt: typeof data.joined_at === "string" ? data.joined_at : typeof data.created_at === "string" ? data.created_at : null
  };
}

function normalizeMemberList(data: unknown): ZoviiMemberList {
  if (!data || typeof data !== "object") return { members: [] };
  const record = data as Record<string, unknown>;
  const rawMembers = Array.isArray(record.members)
    ? (record.members as Array<Record<string, unknown>>)
    : Array.isArray(record.items)
      ? (record.items as Array<Record<string, unknown>>)
      : [];
  return {
    members: rawMembers.map((member) => normalizeMember(member)),
    total: typeof record.total === "number" ? record.total : rawMembers.length,
    page: typeof record.page === "number" ? record.page : undefined,
    limit: typeof record.limit === "number" ? record.limit : undefined
  };
}

function normalizeBalance(data: unknown): ZoviiBalance {
  if (!data || typeof data !== "object") return {};
  const record = data as Record<string, unknown>;
  return {
    balance: typeof record.balance === "number" ? record.balance : null,
    available: typeof record.available === "number" ? record.available : typeof record.available_credits === "number" ? record.available_credits : null,
    poolBalance: typeof record.pool_balance === "number" ? record.pool_balance : null,
    totalAllocated: typeof record.total_allocated === "number" ? record.total_allocated : null,
    currency: typeof record.currency === "string" ? record.currency : null
  };
}

/**
 * Server-side adapter for the Zovii API. All third-party traffic flows through
 * this class so routes never scatter raw fetch calls. Request bodies are never
 * logged; log metadata is sanitized.
 */
export class ZoviiClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly log: ZoviiLogFn;

  constructor(options: ZoviiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.ZOVII_API_BASE_URL ?? "https://zovii.studio").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.log = options.log ?? ((_level, _message) => undefined);
  }

  async sendCode(phone: string, purpose: "register" | "login"): Promise<ZoviiSendCodeResult> {
    const { data } = await this.request<Record<string, unknown>>({
      method: "POST",
      path: "/api/v1/auth/send-code",
      body: { phone, purpose }
    });
    const requestId = typeof data?.request_id === "string" ? data.request_id : undefined;
    return { requestId };
  }

  async register(input: { phone: string; code: string; password: string; username?: string }): Promise<ZoviiAuthSession> {
    const { data } = await this.request<unknown>({
      method: "POST",
      path: "/api/v1/auth/register",
      body: {
        phone: input.phone,
        code: input.code,
        password: input.password,
        ...(input.username ? { username: input.username } : {})
      }
    });
    return normalizeAuthSession(data);
  }

  async phoneLogin(input: { phone: string; code: string }): Promise<ZoviiAuthSession> {
    const { data } = await this.request<unknown>({
      method: "POST",
      path: "/api/v1/auth/phone-login",
      body: { phone: input.phone, code: input.code }
    });
    return normalizeAuthSession(data);
  }

  async login(input: { username: string; password: string }): Promise<ZoviiAuthSession> {
    const { data } = await this.request<unknown>({
      method: "POST",
      path: "/api/v1/auth/login",
      form: { username: input.username, password: input.password }
    });
    return normalizeAuthSession(data);
  }

  async refresh(refreshToken: string): Promise<ZoviiTokens> {
    const { data } = await this.request<Record<string, unknown>>({
      method: "POST",
      path: "/api/v1/auth/refresh",
      body: { refresh_token: refreshToken }
    });
    return normalizeTokens(data ?? {});
  }

  async getEnterpriseMembers(
    store: ZoviiTokenStore,
    params: { page?: number; limit?: number; search?: string; brief?: boolean }
  ): Promise<ZoviiMemberList> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.brief !== undefined) query.set("brief", String(params.brief));
    const { data } = await this.authorizedRequest<unknown>(store, {
      method: "GET",
      path: `/api/v1/enterprise/members${query.toString() ? `?${query.toString()}` : ""}`
    });
    return normalizeMemberList(data);
  }

  async inviteMember(store: ZoviiTokenStore, payload: Record<string, unknown>): Promise<{
    member?: ZoviiMember;
    requestId?: string;
    token?: string;
  }> {
    const { data, requestId } = await this.authorizedRequest<Record<string, unknown>>(store, {
      method: "POST",
      path: "/api/v1/enterprise/members/invite",
      body: payload
    });
    const hasMemberId =
      data &&
      typeof data === "object" &&
      (typeof data.id === "string" || typeof data.member_id === "string" || typeof data.user_id === "string");
    const member = hasMemberId ? normalizeMember(data as Record<string, unknown>) : undefined;
    const token = typeof data?.token === "string" ? data.token : undefined;
    return { member, requestId, token };
  }

  async setMemberRole(store: ZoviiTokenStore, memberId: string, role: string): Promise<{
    member?: ZoviiMember;
    requestId?: string;
  }> {
    const { data, requestId } = await this.authorizedRequest<Record<string, unknown>>(store, {
      method: "PATCH",
      path: `/api/v1/enterprise/members/${encodeURIComponent(memberId)}/role`,
      body: { role }
    });
    const hasMemberId =
      data &&
      typeof data === "object" &&
      (typeof data.id === "string" || typeof data.member_id === "string" || typeof data.user_id === "string");
    const member = hasMemberId ? normalizeMember(data as Record<string, unknown>) : undefined;
    return { member, requestId };
  }

  async setMemberCredits(store: ZoviiTokenStore, memberId: string, payload: Record<string, unknown>): Promise<{
    member?: ZoviiMember;
    requestId?: string;
    result?: unknown;
  }> {
    const { data, requestId } = await this.authorizedRequest<unknown>(store, {
      method: "POST",
      path: `/api/v1/enterprise/members/${encodeURIComponent(memberId)}/credits`,
      body: payload
    });
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const member =
      record.member && typeof record.member === "object"
        ? normalizeMember(record.member as Record<string, unknown>)
        : typeof record.id === "string"
          ? normalizeMember(record)
          : undefined;
    return { member, requestId, result: data };
  }

  async getEnterpriseBalance(store: ZoviiTokenStore): Promise<ZoviiBalance> {
    const { data } = await this.authorizedRequest<unknown>(store, {
      method: "GET",
      path: "/api/v1/enterprise/me/balance"
    });
    return normalizeBalance(data);
  }

  private async authorizedRequest<T>(store: ZoviiTokenStore, options: Omit<RequestOptions, "accessToken">): Promise<RequestResult<T>> {
    const accessToken = await store.getAccessToken();
    try {
      return await this.request<T>({ ...options, accessToken });
    } catch (error) {
      if (error instanceof ZoviiError && error.status === 401) {
        store.invalidate();
        const refreshed = await store.getAccessToken();
        return this.request<T>({ ...options, accessToken: refreshed });
      }
      throw error;
    }
  }

  private async request<T>(options: RequestOptions): Promise<RequestResult<T>> {
    const url = `${this.baseUrl}${options.path}`;
    const headers: Record<string, string> = {};
    if (options.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }
    let body: string | undefined;
    if (options.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(options.form).toString();
    } else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body,
        signal: controller.signal
      });
      const requestId = response.headers.get("x-request-id") ?? undefined;
      const text = await response.text().catch(() => "");
      const json = tryParseJson(text);
      if (!response.ok) {
        throw mapHttpError(response.status, json, requestId ?? undefined);
      }
      this.log("info", "zovii request ok", sanitizeMeta({
        method: options.method,
        path: options.path,
        status: response.status,
        durationMs: Date.now() - startedAt,
        requestId: requestId ?? undefined
      }));
      return { data: (json ?? {}) as T, requestId: requestId ?? undefined, status: response.status };
    } catch (error) {
      if (error instanceof ZoviiError) {
        this.log("warn", "zovii request failed", sanitizeMeta({
          method: options.method,
          path: options.path,
          code: error.code,
          status: error.status,
          retryable: error.retryable,
          requestId: error.externalRequestId
        }));
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeout = new ZoviiError("TIMEOUT", `Zovii request timed out after ${options.timeoutMs ?? this.timeoutMs}ms`, {
          status: 0,
          retryable: true
        });
        this.log("warn", "zovii request timed out", sanitizeMeta({ method: options.method, path: options.path }));
        throw timeout;
      }
      const unknown = new ZoviiError("UNKNOWN", "Zovii network error", {
        status: 0,
        retryable: true,
        cause: error
      });
      this.log("error", "zovii network error", sanitizeMeta({ method: options.method, path: options.path }));
      throw unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}
