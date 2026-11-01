import type { NextConfig } from "next";
import { chatCsp } from "./src/lib/private-chat/csp";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  async redirects() { return [{ source: "/", destination: "/private-chat", permanent: false }]; },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
      ] },
      { source: "/private-chat-nym/:path*", headers: [
        { key: "Content-Security-Policy", value: chatCsp(process.env) },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      ] },
    ];
  },
};
export default config;
