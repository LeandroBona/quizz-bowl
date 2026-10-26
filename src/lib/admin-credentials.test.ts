import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, usernameSchema } from "./admin-credentials";
import { isPublicPath, safeReturnPath } from "./admin-paths";

test("senha é derivada com sal aleatório e rejeita senha incorreta", async () => {
  const first = await hashPassword("Uma senha longa de teste 2026!");
  const second = await hashPassword("Uma senha longa de teste 2026!");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("Uma senha longa de teste 2026!", first), true);
  assert.equal(await verifyPassword("outra senha", first), false);
  assert.equal(await verifyPassword("qualquer", "formato-invalido"), false);
});

test("somente telas e APIs públicas são acessíveis sem login", () => {
  assert.equal(isPublicPath("/telao/evento"), true);
  assert.equal(isPublicPath("/api/public/events/evento/stream"), true);
  assert.equal(isPublicPath("/api/matches/partida/session/public"), true);
  assert.equal(isPublicPath("/api/matches/partida/questions/admin"), false);
  assert.equal(isPublicPath("/api/group-stage"), false);
  assert.equal(isPublicPath("/configuracoes"), false);
  assert.equal(safeReturnPath("//outro-site.com"), "/");
  assert.equal(safeReturnPath("/partidas/123"), "/partidas/123");
  assert.equal(usernameSchema.parse("Professor.A"), "professor.a");
});
