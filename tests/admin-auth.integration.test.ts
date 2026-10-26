import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/lib/admin-credentials";
import { adminFromToken, revokeAdminSession, sessionCookieName } from "../src/server/admin-auth";
import { POST as login } from "../src/app/api/auth/login/route";
import { proxy } from "../src/proxy";

test("dois professores entram separadamente; painel protegido e telão público", async () => {
  const suffix = Date.now().toString(36);
  const password = "Senha de teste longa 2026!";
  const passwordHash = await hashPassword(password);
  const users = await Promise.all(["mediador", "gestor"].map(name => prisma.adminUser.create({ data: { username: `${name}.${suffix}`, name, passwordHash } })));
  try {
    const tokens: string[] = [];
    for (const user of users) {
      const response = await login(new Request("http://localhost:3000/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ username: user.username, password }) }));
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie") ?? "";
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=lax/i);
      const token = cookie.match(new RegExp(`${sessionCookieName}=([^;]+)`))?.[1];
      assert.ok(token);
      tokens.push(token);
      assert.equal((await adminFromToken(token))?.id, user.id);
      const request = new NextRequest("http://localhost:3000/api/matches/teste/session", { headers: { Cookie: `${sessionCookieName}=${token}` } });
      assert.equal((await proxy(request)).status, 200);
    }
    assert.notEqual(tokens[0], tokens[1]);
    assert.equal((await proxy(new NextRequest("http://localhost:3000/api/questions"))).status, 401);
    const redirect = await proxy(new NextRequest("http://localhost:3000/partidas/123"));
    assert.equal(redirect.status, 307);
    assert.match(redirect.headers.get("location") ?? "", /\/login\?next=%2Fpartidas%2F123/);
    assert.equal((await proxy(new NextRequest("http://localhost:3000/api/public/events/evento/presentation"))).status, 200);
    assert.equal((await proxy(new NextRequest("http://localhost:3000/telao/evento"))).status, 200);
    const foreign = new NextRequest("http://localhost:3000/api/presentation", { method: "POST", headers: { Cookie: `${sessionCookieName}=${tokens[1]}`, Origin: "https://outro-site.example" } });
    assert.equal((await proxy(foreign)).status, 403);
    await revokeAdminSession(tokens[0]);
    assert.equal(await adminFromToken(tokens[0]), null);
    assert.equal((await adminFromToken(tokens[1]))?.id, users[1].id);
  } finally {
    await prisma.adminUser.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.$disconnect();
  }
});

test("produção recusa login por HTTP antes de criar sessão", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", "production");
  try {
    const response = await login(new Request("http://quiz.example/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://quiz.example" },
      body: JSON.stringify({ username: "professor", password: "senha qualquer" }),
    }));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /HTTPS/);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    if (previousEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previousEnvironment);
  }
});
