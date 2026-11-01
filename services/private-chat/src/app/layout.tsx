import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PrivateChatShell } from "@/components/private-chat-shell";
import { chatParentOrigin } from "@/lib/private-chat/embedding";
import "./globals.css";
import "./theme.css";

const inter = localFont({ src: "../public-fonts/inter.woff2", variable: "--font-inter", display: "swap" });
const mono = localFont({ src: "../public-fonts/mono.woff2", variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Private Chat · OpenZcash",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#faf8f4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${inter.variable} ${mono.variable}`}><body>
    <PrivateChatShell parentOrigin={chatParentOrigin()}>{children}</PrivateChatShell>
  </body></html>;
}
