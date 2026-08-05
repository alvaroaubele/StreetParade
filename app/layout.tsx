import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ParadeMatch — Street Parade Zürich 2026",
  description:
    "Blind-test the line-up, swipe on 30s snippets, get your personal route for 8 August.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-md px-4 pb-10 antialiased">
        <div className="aurora" aria-hidden>
          <div className="aurora-blob" />
          <div className="aurora-blob" />
          <div className="aurora-blob" />
        </div>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
