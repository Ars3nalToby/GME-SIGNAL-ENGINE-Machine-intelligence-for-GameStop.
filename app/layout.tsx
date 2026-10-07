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
          <main className="mx-auto max-w-[1440px] px-4 pb-20 pt-6 md:px-6">{children}</main>
          <footer className="mono mx-auto max-w-[1440px] border-t border-line px-4 py-8 text-[10.5px] leading-relaxed text-muted md:px-6">
            LIVE WIRE · refreshes every 60s — a polling wire, not a tick feed. Signal score = how much an item matters for understanding GameStop. Not a price prediction or trade signal. Not investment advice.
          </footer>
        </FeedProvider>
      </body>
    </html>
  );
}
