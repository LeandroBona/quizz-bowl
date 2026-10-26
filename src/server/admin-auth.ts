import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/lib/admin-credentials";

export const sessionCookieName = "qb_session";
export const sessionDurationSeconds = 7 * 24 * 60 * 60;
const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function authenticate(username: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;
  if (!await verifyPassword(password, user.passwordHash)) return null;
  return { id: user.id, username: user.username, name: user.name };
}

export async function createAdminSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  await prisma.adminSession.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function adminFromToken(token: string | undefined) {
  if (!token || !sessionTokenPattern.test(token)) return null;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: tokenHash(token) }, select: { expiresAt: true, user: { select: { id: true, username: true, name: true, isActive: true } } } });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) return null;
  return { id: session.user.id, username: session.user.username, name: session.user.name };
}

export async function revokeAdminSession(token: string | undefined) {
  if (token && sessionTokenPattern.test(token)) await prisma.adminSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
}
