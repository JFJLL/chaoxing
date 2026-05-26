import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionCookieValue, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { verifyPassword } from "@/lib/passwords";
import { loginSchema } from "@/lib/validation/auth";

const INVALID_CREDENTIALS_MESSAGE = "邮箱或密码错误";

function isHtmlRequest(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function getRequestOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

function redirectToLogin(request: NextRequest, error: "invalid_credentials" | "invalid_form") {
  const url = new URL("/login", getRequestOrigin(request));
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

async function readCredentials(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { email?: string; password?: string };
    return {
      email: body.email,
      password: body.password
    };
  }

  const formData = await request.formData();
  return {
    email: typeof formData.get("email") === "string" ? String(formData.get("email")) : undefined,
    password: typeof formData.get("password") === "string" ? String(formData.get("password")) : undefined
  };
}

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await readCredentials(request));
  if (!parsed.success) {
    const error =
      parsed.error.flatten().fieldErrors.email?.[0] ??
      parsed.error.flatten().fieldErrors.password?.[0] ??
      "请输入有效邮箱和密码";

    if (isHtmlRequest(request)) {
      return redirectToLogin(request, "invalid_form");
    }

    return NextResponse.json({ error }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, role: true, institutionId: true, passwordHash: true }
  });

  const passwordIsValid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!user || !passwordIsValid) {
    if (isHtmlRequest(request)) {
      return redirectToLogin(request, "invalid_credentials");
    }

    return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const sessionUser = {
    id: user.id,
    name: user.name,
    role: user.role as "STUDENT" | "TEACHER" | "ADMIN",
    institutionId: user.institutionId
  };

  if (isHtmlRequest(request)) {
    const response = NextResponse.redirect(new URL("/space", getRequestOrigin(request)), 303);
    response.cookies.set(SESSION_COOKIE, createSessionCookieValue(sessionUser), getSessionCookieOptions());
    return response;
  }

  const response = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      institutionId: user.institutionId
    }
  });
  response.cookies.set(SESSION_COOKIE, createSessionCookieValue(sessionUser), getSessionCookieOptions());
  return response;
}
