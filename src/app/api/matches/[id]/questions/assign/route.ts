import { z } from "zod";
import { assignMatchQuestions } from "@/server/match-questions";
import { errorResponse } from "@/server/http";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){try{const {id}=await context.params;const data=z.object({eventId:z.string().min(1),questionIds:z.array(z.string().min(1)).min(1).max(100)}).parse(await request.json());return Response.json(await assignMatchQuestions(id,data.eventId,data.questionIds),{status:201});}catch(error){return errorResponse(error);}}
