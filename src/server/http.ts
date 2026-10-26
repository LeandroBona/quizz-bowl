import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError } from "@/server/errors";

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "Dados inválidos.", issues: error.issues }, { status: 400 });
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientInitializationError) return Response.json({ error: "Banco de dados indisponível. Inicie o MySQL e tente novamente." }, { status: 503 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1001") return Response.json({ error: "Banco de dados indisponível. Inicie o MySQL e tente novamente." }, { status: 503 });
    if (error.code === "P2002") return Response.json({ error: "Já existe um registro com esses dados." }, { status: 409 });
    if (error.code === "P2003") return Response.json({ error: "Este registro é usado por outros dados e não pode ser removido." }, { status: 409 });
    if (error.code === "P2025") return Response.json({ error: "Registro não encontrado." }, { status: 404 });
    if (error.code === "P2034") return Response.json({ error: "Os dados mudaram durante a operação. Atualize a página e tente novamente." }, { status: 409 });
  }
  console.error(error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}
