import {handleOwnerAdvisor} from '@/lib/owner-advisor-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleOwnerAdvisor(request);
export const POST=(request:Request)=>handleOwnerAdvisor(request);
