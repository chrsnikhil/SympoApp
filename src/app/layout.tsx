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
  title: "Spider Sense — Symposium Quiz",
  description: "Spider Sense — XPLORE'26 event platform.",
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
      <body className="min-h-full flex flex-col bg-background font-body-md text-on-surface selection:bg-primary selection:text-on-primary relative">
        {/* Vintage Bronze Age comic page background layers */}
        <div className="comic-bg" aria-hidden="true">
          <div className="comic-bg__paper" />
          <div className="comic-bg__page" />
          <div className="comic-bg__misprint" />
          <div className="comic-bg__halftone" />
          <div className="comic-bg__grain" />
          <div className="comic-bg__center-wash" />
          <div className="comic-bg__vignette" />
        </div>
        <div className="relative z-10 flex-1 flex flex-col">{children}</div>
        <div className="noise-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}

