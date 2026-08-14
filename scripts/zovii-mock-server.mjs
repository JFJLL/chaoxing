// Local mock of the Zovii API for browser verification (no real side effects).
// Fixed SMS code "123456"; in-memory users/members/balance only.
import http from "node:http";

const PORT = Number(process.env.ZOVII_MOCK_PORT ?? 8787);

const state = {
  users: new Map(), // phone -> { id, phone, username }
  members: new Map(), // externalUserId -> { user_id, username, role, enterprise_balance, ... }
  balance: { pool_balance: 1000, balance: 1000, available: 1000, total_allocated: 0 },
  inviteTokens: new Map()
};

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function authSession(phone, username) {
  const userId = `zovii-${phone}`;
  state.users.set(phone, { id: userId, phone, username });
  return {
    access_token: `mock-access-${userId}`,
    refresh_token: `mock-refresh-${userId}`,
    expires_in: 3600,
    user: {
      id: userId,
      phone,
      username,
      nickname: username,
      display_id: username
    }
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  try {
    if (request.method === "POST" && path === "/api/v1/auth/send-code") {
      const body = await readJson(request);
      if (!/^1[3-9]\d{9}$/.test(body.phone ?? "")) {
        return send(response, 400, { message: "invalid phone" });
      }
      if (!["register", "login"].includes(body.purpose)) {
        return send(response, 400, { message: "invalid purpose" });
      }
      return send(response, 200, { request_id: `mock-send-${Date.now()}` });
    }

    if (request.method === "POST" && path === "/api/v1/auth/register") {
      const body = await readJson(request);
      if (body.code !== "123456") {
        return send(response, 400, { message: "code is invalid" });
      }
      if (state.users.has(body.phone)) {
        return send(response, 409, { message: "phone already registered" });
      }
      return send(response, 200, authSession(body.phone, body.username ?? "新用户"));
    }

    if (request.method === "POST" && path === "/api/v1/auth/phone-login") {
      const body = await readJson(request);
      if (body.code !== "123456") {
        return send(response, 400, { message: "code is invalid" });
      }
      const existing = state.users.get(body.phone);
      if (!existing) {
        return send(response, 422, { message: "phone not registered" });
      }
      return send(response, 200, authSession(body.phone, existing.username));
    }

    if (request.method === "POST" && path === "/api/v1/auth/login") {
      const body = await readJson(request);
      const user = [...state.users.values()].find(
        (item) => item.username === body.username && typeof body.password === "string" && body.password.length >= 6
      );
      if (!user) {
        return send(response, 401, { message: "bad credentials" });
      }
      return send(response, 200, authSession(user.phone, user.username));
    }

    if (request.method === "POST" && path === "/api/v1/auth/refresh") {
      const body = await readJson(request);
      if (typeof body.refresh_token !== "string" || !body.refresh_token.startsWith("mock-refresh-")) {
        return send(response, 401, { message: "invalid refresh token" });
      }
      const userId = body.refresh_token.slice("mock-refresh-".length);
      return send(response, 200, {
        access_token: `mock-access-${userId}`,
        refresh_token: body.refresh_token,
        expires_in: 3600
      });
    }

    if (request.method === "GET" && path === "/api/v1/enterprise/members") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const search = (url.searchParams.get("search") ?? "").trim();
      let items = [...state.members.values()].map((member) => ({
        ...member,
        consumption: member.consumption ?? 0,
        call_count: member.call_count ?? 0,
        top_models: []
      }));
      if (search) {
        items = items.filter(
          (item) =>
            (item.username ?? "").includes(search) ||
            (item.user_id ?? "").includes(search) ||
            (item.display_id ?? "").includes(search)
        );
      }
      const total = items.length;
      const slice = items.slice((page - 1) * limit, page * limit);
      return send(response, 200, { items: slice, total, page, limit });
    }

    if (request.method === "POST" && path === "/api/v1/enterprise/members/invite") {
      const body = await readJson(request);
      const token = `mock-invite-${Date.now()}`;
      state.inviteTokens.set(token, { type: body.type, role: body.role });
      return send(response, 200, { token });
    }

    if (request.method === "PATCH" && /^\/api\/v1\/enterprise\/members\/[^/]+\/role$/.test(path)) {
      const userId = decodeURIComponent(path.split("/")[5]);
      const body = await readJson(request);
      const member = state.members.get(userId);
      if (!member) {
        return send(response, 404, { message: "member not found" });
      }
      member.role = body.role;
      return send(response, 200, member);
    }

    if (request.method === "POST" && /^\/api\/v1\/enterprise\/members\/[^/]+\/credits$/.test(path)) {
      const userId = decodeURIComponent(path.split("/")[5]);
      const body = await readJson(request);
      const member = state.members.get(userId);
      if (!member) {
        return send(response, 404, { message: "member not found" });
      }
      const delta = body.action === "allocate" ? body.amount : -body.amount;
      const current = member.enterprise_balance ?? 0;
      if (current + delta < 0) {
        return send(response, 400, { message: "insufficient member balance" });
      }
      if (body.action === "allocate" && state.balance.pool_balance < body.amount) {
        return send(response, 400, { message: "insufficient pool balance" });
      }
      if (body.action === "allocate") {
        state.balance.pool_balance -= body.amount;
        state.balance.available -= body.amount;
      } else {
        state.balance.pool_balance += body.amount;
        state.balance.available += body.amount;
      }
      member.enterprise_balance = current + delta;
      return send(response, 200, member);
    }

    if (request.method === "GET" && path === "/api/v1/enterprise/me/balance") {
      return send(response, 200, state.balance);
    }

    // Test-only seeding helper: adds an enterprise member to the in-memory state.
    if (request.method === "POST" && path === "/api/v1/mock/seed-member") {
      const body = await readJson(request);
      const userId = body.user_id ?? `zovii-${body.phone ?? "unknown"}`;
      const existing = state.members.get(userId);
      if (existing) {
        return send(response, 200, existing);
      }
      const member = {
        user_id: userId,
        username: body.username ?? "学习者",
        display_id: body.display_id ?? body.username ?? "learner",
        role: body.role ?? "member",
        enterprise_balance: body.enterprise_balance ?? 0,
        consumption: 0,
        call_count: 0,
        top_models: [],
        joined_at: new Date().toISOString()
      };
      state.members.set(userId, member);
      if (body.phone && !state.users.has(body.phone)) {
        state.users.set(body.phone, { id: userId, phone: body.phone, username: member.username });
      }
      return send(response, 200, member);
    }

    return send(response, 404, { message: `mock: no route for ${request.method} ${path}` });
  } catch (error) {
    send(response, 500, { message: `mock server error: ${error.message}` });
  }
});

// Expose a helper for tests/browser flows to seed members.
server.__state = state;
server.__authSession = authSession;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[zovii-mock] listening on http://127.0.0.1:${PORT}`);
});
