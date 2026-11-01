import type { NextConfig } from "next";
import { participateParentOrigin } from "./lib/domain/participate-embed";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  output: "standalone",
  outputFileTracingIncludes: { "/*": ["./data/**/*", "./node_modules/.prisma/client/**/*"] },
  devIndicators: false,
  poweredByHeader: false,
  // A dedicated asset namespace lets OpenZcash proxy this application without
  // mixing its JavaScript, styles or image optimizer with the portal's build.
  assetPrefix: "/_participate-assets",
  images: { path: "/_participate-assets/_next/image" },
  async rewrites() {
    return [{ source: "/_participate-assets/_next/image", destination: "/_next/image" }];
  },
  async headers() {
    const parent = participateParentOrigin(process.env.PARTICIPATE_PARENT_ORIGIN);
    const csp = [
      "default-src 'self'", `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'",
      "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
    ].join("; ");
    return [
      { source: "/:path*", headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      ...["/participate", "/participate/committee"].map(source => ({ source, headers: [
        { key: "Content-Security-Policy", value: parent ? csp.replace("frame-ancestors 'self'", `frame-ancestors 'self' ${parent}`) : csp },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ] })),
    ];
  },
};

export default nextConfig;
