import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/intro/index.html", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
