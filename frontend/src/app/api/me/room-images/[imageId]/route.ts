import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export async function GET(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  if (!/^\d+$/.test(imageId)) return new NextResponse(null, { status: 404 });
  try {
    const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("gt_session="));
    if (!cookie) return new NextResponse(null, { status: 401 });
    const upstream = await fetch(`${apiBaseUrl}/me/room-images/${encodeURIComponent(imageId)}`, { headers: { cookie }, cache: "no-store" });
    if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: upstream.status || 502 });
    const contentType = upstream.headers.get("content-type");
    if (!contentType?.startsWith("image/")) return new NextResponse(null, { status: 502 });
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
