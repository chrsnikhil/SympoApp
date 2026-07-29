import type { Metadata } from "next";
import { Anybody, Bricolage_Grotesque, Courier_Prime, Inter, Anton, Bangers, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const anybody = Anybody({ subsets: ["latin"], variable: "--font-anybody" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const courier = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-courier" });

export const metadata: Metadata = {
  title: "Spider-Verse Tech Challenge — Symposium Quiz",
  description: "Spider-Verse Tech Challenge — XPLORE'26 event platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${anton.variable} ${bangers.variable} ${geistMono.variable} ${anybody.variable} ${bricolage.variable} ${courier.variable} h-full antialiased`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background font-body-md text-on-surface selection:bg-primary selection:text-on-primary">
        <div className="fixed inset-0 pointer-events-none ben-day" id="global-ben-day" />
        {children}
        {/* Takes the flatness off large black areas. Fixed, non-interactive. */}
        <div className="noise-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}

