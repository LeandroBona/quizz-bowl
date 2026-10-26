import { NextResponse, type NextRequest } from "next/server";
import { adminFromToken, sessionCookieName } from "@/server/admin-auth";
import { isPublicPath, safeReturnPath } from "@/lib/admin-paths";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();

  let admin;
  try { admin = await adminFromToken(request.cookies.get(sessionCookieName)?.value); }
  catch { return NextResponse.json({ error: "Autenticação indisponível. Verifique o banco de dados." }, { status: 503 }); }
  if (!admin) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Faça login para acessar o painel." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", safeReturnPath(pathname + request.nextUrl.search));
    return NextResponse.redirect(login);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== host)) {
      return NextResponse.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
