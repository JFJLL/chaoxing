import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionCookieValue, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords";
import { registerSchema } from "@/lib/validation/auth";
import { grantInitialTeacherCreditsInTransaction } from "@/lib/billing/credit-service";

const EMAIL_EXISTS_MESSAGE = "该邮箱已被注册";

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

function redirectToRegister(request: NextRequest, error: "email_exists" | "invalid_form") {
  const url = new URL("/register", getRequestOrigin(request));
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

async function readRegisterBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { name?: string; email?: string; password?: string; role?: string };
    return {
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role
    };
  }

  const formData = await request.formData();
  return {
    name: typeof formData.get("name") === "string" ? String(formData.get("name")) : undefined,
    email: typeof formData.get("email") === "string" ? String(formData.get("email")) : undefined,
    password: typeof formData.get("password") === "string" ? String(formData.get("password")) : undefined,
    role: typeof formData.get("role") === "string" ? String(formData.get("role")) : undefined
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await readRegisterBody(request);
  const parsed = registerSchema.safeParse(rawBody);

  if (!parsed.success) {
    const error =
      parsed.error.flatten().fieldErrors.name?.[0] ??
      parsed.error.flatten().fieldErrors.email?.[0] ??
      parsed.error.flatten().fieldErrors.password?.[0] ??
      parsed.error.flatten().fieldErrors.role?.[0] ??
      "请填写有效注册信息";

    if (isHtmlRequest(request)) {
      return redirectToRegister(request, "invalid_form");
    }

    return NextResponse.json({ error }, { status: 400 });
  }

  const existingUser = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true }
  });

  if (existingUser) {
    if (isHtmlRequest(request)) {
      return redirectToRegister(request, "email_exists");
    }

    return NextResponse.json({ error: EMAIL_EXISTS_MESSAGE }, { status: 409 });
  }

  let institution = await db.institution.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (!institution) {
    institution = await db.institution.create({
      data: {
        name: "默认机构",
        branding: "yimei-local"
      },
      select: { id: true }
    });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
        institutionId: institution.id
      },
      select: {
        id: true,
        name: true,
        role: true,
        institutionId: true
      }
    });
    await grantInitialTeacherCreditsInTransaction(tx, created.id, created.role);
    return created;
  });

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

  const response = NextResponse.json({ user }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, createSessionCookieValue(sessionUser), getSessionCookieOptions());
  return response;
}
