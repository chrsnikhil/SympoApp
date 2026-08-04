import type { Metadata } from "next";
import { Chakra_Petch, Space_Grotesk, Outfit, Fira_Code } from "next/font/google";
import "./globals.css";

const chakraPetch = Chakra_Petch({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-chakra",
});

const spaceGrotesk = Space_Grotesk({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-space",
});

const outfit = Outfit({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-outfit",
});

const firaCode = Fira_Code({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-fira",
});

export const metadata: Metadata = {
  title: "XPLORE 26 - Multiverse Breach",
  description: "Spider-Verse CTF Event",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${chakraPetch.variable} ${spaceGrotesk.variable} ${outfit.variable} ${firaCode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

