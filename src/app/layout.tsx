import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  Anybody, Bricolage_Grotesque, Courier_Prime, Inter, Anton, Bangers, Geist_Mono,
  Chakra_Petch, Space_Grotesk, Outfit, Fira_Code,
} from "next/font/google";
import { eventFromHost } from "@/lib/config";
import "./globals.css";

/* Quiz faces. */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const anybody = Anybody({ subsets: ["latin"], variable: "--font-anybody" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const courier = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-courier" });

/* CTF / hunt faces. Both sets load on every page: they are CSS variables, and
   only the rules that reference them decide which is actually painted. */
const chakraPetch = Chakra_Petch({ weight: ["400", "600", "700"], subsets: ["latin"], variable: "--font-chakra" });
const spaceGrotesk = Space_Grotesk({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-space" });
const outfit = Outfit({ weight: ["400", "500", "600", "700", "800"], subsets: ["latin"], variable: "--font-outfit" });
const firaCode = Fira_Code({ weight: ["400", "600"], subsets: ["latin"], variable: "--font-fira" });

const FONT_VARS = [
  inter, anton, bangers, geistMono, anybody, bricolage, courier,
  chakraPetch, spaceGrotesk, outfit, firaCode,
].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "XPLORE'26",
  description: "XPLORE'26 event platform — quiz, treasure hunt, CTF and speed coding.",
};

/**
 * One layout serves four events, so the theme has to be selectable at runtime.
 *
 * `data-event` on <body> is that switch: `globals.css` scopes the CTF and hunt
 * element rules under it, which is what stops their `!important` heading
 * overrides from restyling the quiz. It reads the Host header directly for the
 * same reason `/enter` does — the layout renders for unrewritten paths too, so
 * the proxy's `x-event` header is not always present.
 */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const event = eventFromHost((await headers()).get("host"));

  return (
    <html lang="en" className={`${FONT_VARS} h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        data-event={event ?? "app"}
        className="min-h-full flex flex-col bg-background font-body-md text-on-surface selection:bg-primary selection:text-on-primary relative"
      >
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
