import type { Metadata, Viewport } from "next";
import "./globals.css";
import { inter, plexMono } from "./fonts";
import { FeedProvider } from "@/components/FeedProvider";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "GME LIVE WIRE — GameStop Intelligence Terminal",
  description: "Everything that matters to GameStop, before the noise catches up. Polling wire: SEC EDGAR, GameStop IR, news, optional X.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#090b10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">
        <FeedProvider>
          <Header />
          <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-5">{children}</main>
          <footer className="mono mx-auto max-w-[1500px] px-4 pb-8 text-[10.5px] leading-relaxed text-muted">
            LIVE WIRE · refreshes every 60s — a polling wire, not a tick feed. Signal score = how much an item matters for understanding GameStop. Not a price prediction or trade signal. Not investment advice.
          </footer>
        </FeedProvider>
      </body>
    </html>
  );
}
