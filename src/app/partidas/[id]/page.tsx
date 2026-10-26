import { MatchControl } from "@/components/matches/match-control";
export default async function MatchPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <MatchControl matchId={id}/>;}
