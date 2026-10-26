import { cookies } from "next/headers";
import { adminFromToken, sessionCookieName } from "@/server/admin-auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await adminFromToken((await cookies()).get(sessionCookieName)?.value);
    if (!user) return Response.json({ error: "Sessão expirada." }, { status: 401 });
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
