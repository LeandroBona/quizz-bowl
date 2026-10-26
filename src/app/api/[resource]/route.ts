import { createRecord, isResource, listRecords, parseBody } from "@/server/resources";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  const { resource } = await context.params;
  if (!isResource(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });
  try { return Response.json(await listRecords(resource, new URL(request.url).searchParams.get("eventId"))); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  const { resource } = await context.params;
  if (!isResource(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });
  try { return Response.json(await createRecord(resource, parseBody(resource, await request.json())), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
