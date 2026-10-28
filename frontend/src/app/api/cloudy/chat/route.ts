import { handleCloudyChat } from "@/lib/cloudy-local-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleCloudyChat(request);
