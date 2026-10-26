import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/admin-credentials";
import { authenticate, createAdminSession, sessionCookieName, sessionDurationSeconds } from "@/server/admin-auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    if (origin && new URL(origin).host !== host) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    const publicUrl = new URL(origin ?? request.url);
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const https = origin ? publicUrl.protocol === "https:" : forwardedProtocol ? forwardedProtocol === "https" : publicUrl.protocol === "https:";
    if (process.env.NODE_ENV === "production" && !https && !["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname)) {
      return NextResponse.json({ error: "O acesso administrativo exige HTTPS na VPS. Abra o sistema por https:// após configurar um certificado TLS." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const { username, password } = loginSchema.parse(await request.json());
    const user = await authenticate(username, password);
    if (!user) return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const session = await createAdminSession(user.id);
    const response = NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionDurationSeconds, expires: session.expiresAt });
    return response;
  } catch (error) { return errorResponse(error); }
}
