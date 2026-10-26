import { PrismaClient } from "@prisma/client";
import { hashPassword, passwordSchema, usernameSchema } from "../src/lib/admin-credentials";

const prisma = new PrismaClient();

function hiddenQuestion(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("Execute este comando em um terminal interativo.");
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\u0003") { finish(new Error("Operação cancelada.")); return; }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const [command, rawUsername, ...nameParts] = process.argv.slice(2);
  if (!(["create", "reset"] as string[]).includes(command) || !rawUsername || (command === "create" && !nameParts.length)) {
    throw new Error('Uso: npm run admin:user -- create usuario "Nome do professor" | reset usuario');
  }
  const username = usernameSchema.parse(rawUsername);
  const existing = await prisma.adminUser.findUnique({ where: { username }, select: { id: true } });
  if (command === "create" && existing) throw new Error("Este usuário já existe. Use reset para alterar a senha.");
  if (command === "reset" && !existing) throw new Error("Usuário não encontrado.");
  const password = passwordSchema.parse(await hiddenQuestion("Senha (mínimo 12 caracteres): "));
  const confirmation = await hiddenQuestion("Repita a senha: ");
  if (password !== confirmation) throw new Error("As senhas não conferem.");
  const passwordHash = await hashPassword(password);
  if (command === "create") {
    const name = nameParts.join(" ").trim();
    if (name.length < 2 || name.length > 120) throw new Error("Informe o nome completo do professor.");
    await prisma.adminUser.create({ data: { username, name, passwordHash } });
    console.log(`Conta criada: ${username}`);
  } else {
    await prisma.$transaction([
      prisma.adminUser.update({ where: { username }, data: { passwordHash, isActive: true } }),
      prisma.adminSession.deleteMany({ where: { userId: existing!.id } }),
    ]);
    console.log(`Senha atualizada e sessões anteriores revogadas: ${username}`);
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
