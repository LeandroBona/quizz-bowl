export function isPublicPath(pathname: string) {
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/telao/") || pathname.startsWith("/api/public/")) return true;
  if (/^\/api\/matches\/[^/]+\/(?:session|questions)\/public$/.test(pathname)) return true;
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/robots.txt") return true;
  return false;
}

export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login") || value.includes("\\")) return "/";
  return value;
}
