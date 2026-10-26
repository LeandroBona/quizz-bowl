import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const parameters = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, parameters, (error, value) => error ? reject(error) : resolve(value)));
}
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,80}$/, "Use de 3 a 80 letras minúsculas, números, ponto, hífen ou sublinhado.");
export const passwordSchema = z.string().min(12, "Use pelo menos 12 caracteres.").max(200);
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(200) });

export async function hashPassword(password: string) {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString("base64url");
  const derived = await derive(password, salt);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || n !== String(parameters.N) || r !== String(parameters.r) || p !== String(parameters.p) || !salt || !encoded || password.length > 200) return false;
  const expected = Buffer.from(encoded, "base64url");
  if (expected.length !== 64) return false;
  const derived = await derive(password, salt);
  return timingSafeEqual(derived, expected);
}
