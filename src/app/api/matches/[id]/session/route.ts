import { z } from "zod";
import { cookies } from "next/headers";
import { errorResponse } from "@/server/http";
import { actionSchema, matchSessionState, performMatchAction } from "@/server/match-session";
import { adminFromToken, sessionCookieName } from "@/server/admin-auth";
import { ApiError } from "@/server/errors";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const {id}=await context.params;const eventId=z.string().min(1).parse(new URL(request.url).searchParams.get("eventId"));return Response.json(await matchSessionState(id,eventId),{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}}
export async function POST(request:Request,context:Context){try{const user=await adminFromToken((await cookies()).get(sessionCookieName)?.value);if(!user)throw new ApiError(401,"Faça login para administrar a partida.");const {id}=await context.params;return Response.json(await performMatchAction(id,actionSchema.parse(await request.json()),user.username));}catch(error){return errorResponse(error);}}
