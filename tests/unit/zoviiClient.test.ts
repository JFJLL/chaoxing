import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoviiClient, sanitizeMeta } from "../../src/lib/zovii/client";
import { ZoviiTokenStore } from "../../src/lib/zovii/tokenStore";

type CallRecord = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function createFetchMock(
  handlers: Array<(call: CallRecord) => Response>,
  overrides: { onRequest?: (call: CallRecord) => void } = {}
) {
  const calls: CallRecord[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    overrides.onRequest?.(call);
    const index = Math.min(calls.length - 1, handlers.length - 1);
    return handlers[index](call);
  });
  return { fetchImpl, calls };
}

const AUTH_RESPONSE = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_in: 3600,
  user: {
    id: "zovii-user-1",
    phone: "13800000000",
    username: "teacher-1",
    enterprise_id: "enterprise-1",
    enterprise_role: "enterprise_admin"
  }
};

describe("ZoviiClient contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sendCode posts JSON with purpose=register and no auth header", async () => {
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { request_id: "req-1" })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    const result = await client.sendCode("13800000000", "register");

    expect(result.requestId).toBe("req-1");
    const call = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((call.headers as Record<string, string>)["content-type"]).toContain("application/json");
    expect(call.headers).not.toHaveProperty("authorization");
    expect(JSON.parse(String(call.body))).toEqual({ phone: "13800000000", purpose: "register" });
  });

  it("register posts JSON with phone/code/password/username", async () => {
    const { fetchImpl } = createFetchMock([() => jsonResponse(200, AUTH_RESPONSE)]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    const session = await client.register({
      phone: "13800000000",
      code: "123456",
      password: "SecretPass2026",
      username: "teacher-1"
    });

    expect(session.user.id).toBe("zovii-user-1");
    expect(session.user.enterpriseRole).toBe("enterprise_admin");
    expect(session.tokens).toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600 });
    const call = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(String(call.body)) as Record<string, string>;
    expect(body).toEqual({
      phone: "13800000000",
      code: "123456",
      password: "SecretPass2026",
      username: "teacher-1"
    });
  });

  it("login uses x-www-form-urlencoded encoding", async () => {
    const { fetchImpl } = createFetchMock([() => jsonResponse(200, AUTH_RESPONSE)]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    await client.login({ username: "user@example.com", password: "SecretPass2026" });

    const call = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((call.headers as Record<string, string>)["content-type"]).toContain("application/x-www-form-urlencoded");
    expect(String(call.body)).toContain("username=user%40example.com");
    expect(String(call.body)).toContain("password=SecretPass2026");
  });

  it("phoneLogin posts JSON with phone and code", async () => {
    const { fetchImpl } = createFetchMock([() => jsonResponse(200, AUTH_RESPONSE)]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    const session = await client.phoneLogin({ phone: "13800000000", code: "123456" });
    expect(session.user.id).toBe("zovii-user-1");
    const call = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(call.body))).toEqual({ phone: "13800000000", code: "123456" });
  });

  it("refresh posts JSON with refresh_token", async () => {
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { access_token: "access-new", refresh_token: "refresh-1", expires_in: 3600 })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    const tokens = await client.refresh("refresh-1");
    expect(tokens.accessToken).toBe("access-new");
    const call = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(call.body))).toEqual({ refresh_token: "refresh-1" });
  });

  it("retries once with a fresh token after a 401 on enterprise calls", async () => {
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { access_token: "access-old", refresh_token: "refresh-1", expires_in: 3600 }),
      () => jsonResponse(401, { message: "token expired" }),
      () => jsonResponse(200, { access_token: "access-new", refresh_token: "refresh-1", expires_in: 3600 }),
      () => jsonResponse(200, { members: [{ id: "m-1", user_id: "zovii-user-1", role: "member" }], total: 1 })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });
    const store = new ZoviiTokenStore("refresh-1", client);

    const list = await client.getEnterpriseMembers(store, { page: 1, limit: 20 });

    expect(list.members).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const authorizationHeaders = fetchImpl.mock.calls
      .map((call) => ((call[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.authorization)
      .filter(Boolean);
    expect(authorizationHeaders).toEqual(["Bearer access-old", "Bearer access-new"]);
    const refreshCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(2);
  });

  it("does not retry on non-401 errors", async () => {
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { access_token: "access-old", refresh_token: "refresh-1", expires_in: 3600 }),
      () => jsonResponse(500, { message: "boom" })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });
    const store = new ZoviiTokenStore("refresh-1", client);

    await expect(client.getEnterpriseMembers(store, {})).rejects.toMatchObject({
      code: "SERVER_ERROR",
      retryable: true
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps HTTP errors to stable codes and Chinese user messages", async () => {
    const cases: Array<{ status: number; body: unknown; code: string; userMessage: string }> = [
      { status: 400, body: { message: "code is invalid" }, code: "INVALID_CODE", userMessage: "验证码错误，请检查后重试" },
      { status: 400, body: { message: "code expired" }, code: "CODE_EXPIRED", userMessage: "验证码已过期，请重新获取" },
      { status: 409, body: { message: "phone already registered" }, code: "PHONE_ALREADY_REGISTERED", userMessage: "该手机号已注册 Zovii 账号，可登录后关联已有账号" },
      { status: 401, body: { detail: "bad credentials" }, code: "INVALID_CREDENTIALS", userMessage: "Zovii 账号或密码错误" },
      { status: 403, body: {}, code: "ENTERPRISE_ACCESS_DENIED", userMessage: "当前 Zovii 账号没有企业管理员权限" },
      { status: 429, body: {}, code: "RATE_LIMITED", userMessage: "操作过于频繁，请稍后重试" },
      { status: 503, body: {}, code: "SERVER_ERROR", userMessage: "Zovii 服务暂时不可用，请稍后重试" }
    ];

    for (const testCase of cases) {
      const { fetchImpl } = createFetchMock([() => jsonResponse(testCase.status, testCase.body)]);
      const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });
      await expect(client.sendCode("13800000000", "register")).rejects.toMatchObject({
        code: testCase.code,
        status: testCase.status
      });
    }
  });

  it("surfaces rate limit retry-after guidance", async () => {
    const { fetchImpl } = createFetchMock([() => jsonResponse(429, { message: "too many requests" })]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    const error = await client.sendCode("13800000000", "register").catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });

  it("times out and maps to TIMEOUT", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        })
    );
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl, timeoutMs: 30 });

    await expect(client.sendCode("13800000000", "register")).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: true
    });
  });

  it("maps network failures to UNKNOWN", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });

    await expect(client.phoneLogin({ phone: "13800000000", code: "123456" })).rejects.toMatchObject({
      code: "UNKNOWN",
      retryable: true
    });
  });

  it("never logs password, code, or token values", async () => {
    const log = vi.fn();
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { request_id: "req-1" }),
      () => jsonResponse(200, AUTH_RESPONSE),
      () => jsonResponse(400, { message: "code is invalid" })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl, log });

    await client.sendCode("13800000000", "register");
    await client.register({ phone: "13800000000", code: "654321", password: "SuperSecret2026", username: "u1" });
    await client.phoneLogin({ phone: "13800000000", code: "654321" }).catch(() => undefined);

    expect(log).toHaveBeenCalled();
    const serialized = JSON.stringify(log.mock.calls.map((call) => call[2] ?? {}));
    expect(serialized).not.toContain("654321");
    expect(serialized).not.toContain("SuperSecret2026");
    expect(serialized).not.toContain("access-1");
    expect(serialized).not.toContain("refresh-1");
  });

  it("sanitizeMeta redacts sensitive keys", () => {
    expect(
      sanitizeMeta({
        password: "p",
        code: "c",
        accessToken: "t",
        refresh_token: "r",
        path: "/api/v1/auth/register",
        status: 200
      })
    ).toEqual({
      password: "[REDACTED]",
      code: "[REDACTED]",
      accessToken: "[REDACTED]",
      refresh_token: "[REDACTED]",
      path: "/api/v1/auth/register",
      status: 200
    });
  });

  it("getEnterpriseMembers forwards pagination and search query params", async () => {
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 }),
      () => jsonResponse(200, { members: [], total: 0 })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });
    const store = new ZoviiTokenStore("refresh-1", client);

    await client.getEnterpriseMembers(store, { page: 2, limit: 50, search: "王" });

    const membersCall = fetchImpl.mock.calls.find((call) => String(call[0]).includes("/enterprise/members"));
    expect(String(membersCall?.[0])).toContain("page=2");
    expect(String(membersCall?.[0])).toContain("limit=50");
    expect(String(membersCall?.[0])).toContain("search=");
  });

  it("normalizes enterprise member and balance responses", async () => {
    const { fetchImpl } = createFetchMock([
      () => jsonResponse(200, { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 }),
      () =>
        jsonResponse(200, {
          members: [
            { id: "m-1", user_id: "zovii-user-1", phone: "13800000000", nickname: "李老师", role: "enterprise_admin", status: "ACTIVE", credits: 120 }
          ],
          total: 1,
          page: 1,
          limit: 20
        }),
      () => jsonResponse(200, { balance: 1000, available_credits: 800, total_allocated: 200, currency: "CNY" })
    ]);
    const client = new ZoviiClient({ baseUrl: "https://zovii.test", fetchImpl });
    const store = new ZoviiTokenStore("refresh-1", client);

    const list = await client.getEnterpriseMembers(store, { page: 1, limit: 20 });
    expect(list.members[0]).toMatchObject({
      id: "zovii-user-1",
      userId: "zovii-user-1",
      phone: "13800000000",
      name: "李老师",
      role: "enterprise_admin",
      credits: 120
    });

    const balance = await client.getEnterpriseBalance(store);
    expect(balance).toMatchObject({ balance: 1000, available: 800, totalAllocated: 200, currency: "CNY" });
  });
});
