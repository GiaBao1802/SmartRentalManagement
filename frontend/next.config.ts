import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").origin;
    return ["/accept-invitation", "/reset-password", "/forgot-password"].map(source => ({ source, headers: [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${apiOrigin}; form-action 'self'; base-uri 'self'; frame-ancestors 'none'` },
    ] }));
  },
};

export default nextConfig;
