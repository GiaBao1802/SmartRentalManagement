import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  if (!/^\d+$/.test(imageId)) return new NextResponse(null, { status: 404 });

  try {
    const upstream = await fetch(`${apiBaseUrl}/public/room-images/${encodeURIComponent(imageId)}`, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: upstream.status || 502 });
    const contentType = upstream.headers.get("content-type");
    if (!contentType?.startsWith("image/")) return new NextResponse(null, { status: 502 });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
