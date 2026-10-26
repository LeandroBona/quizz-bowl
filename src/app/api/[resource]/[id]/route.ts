import { deleteRecord, isResource, parseBody, updateRecord } from "@/server/resources";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function PUT(request: Request, context: Context) {
  const { resource, id } = await context.params;
  if (!isResource(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });
  try { return Response.json(await updateRecord(resource, id, parseBody(resource, await request.json()))); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  const { resource, id } = await context.params;
  if (!isResource(resource)) return Response.json({ error: "Recurso não encontrado." }, { status: 404 });
  try { await deleteRecord(resource, id, new URL(request.url).searchParams.get("eventId")); return new Response(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
