import type { Metadata } from "next";
import { Anton, Bangers, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted through next/font rather than a <link> to Google.
 * Two reasons, both about the moment many people open this at once: it
 * removes a third-party round trip from the critical path, and it eliminates
 * the layout shift a font swap causes — which would otherwise land
 * mid-countdown, moving the answer a team is about to click.
 *
 * Anton and Bangers are DISPLAY faces. Neither has a lowercase worth reading
 * at body size, and neither should ever hold question text — see the "part
 * people get wrong" note in globals.css.
 */

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "XPLORE'26 — Spider Multiverse Tech Quiz",
  description: "Spider Multiverse Tech Quiz — XPLORE'26 event platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${bangers.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Takes the flatness off large black areas. Fixed, non-interactive. */}
        <div className="noise-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
