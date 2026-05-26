import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

function getRequestOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

export async function POST(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    const response = NextResponse.redirect(new URL("/login", getRequestOrigin(request)), 303);
    response.cookies.set(SESSION_COOKIE, "", getSessionCookieOptions(0));
    return response;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", getSessionCookieOptions(0));
  return response;
}
