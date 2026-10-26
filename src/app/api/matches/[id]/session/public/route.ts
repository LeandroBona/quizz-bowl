import { z } from "zod";
import { errorResponse } from "@/server/http";
import { matchSessionState } from "@/server/match-session";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const {id}=await context.params;const eventId=z.string().min(1).parse(new URL(request.url).searchParams.get("eventId"));return Response.json(await matchSessionState(id,eventId,true),{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}}
