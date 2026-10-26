import { NextResponse, type NextRequest } from "next/server";
import { revokeAdminSession, sessionCookieName } from "@/server/admin-auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    if (origin && new URL(origin).host !== host) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    await revokeAdminSession(request.cookies.get(sessionCookieName)?.value);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) { return errorResponse(error); }
}
