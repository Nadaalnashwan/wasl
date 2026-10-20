import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Marhey, Nunito, Patrick_Hand } from "next/font/google";
import { RoughFilterDefs } from "@/components/sketch/illustrations";
import { Providers } from "@/lib/providers";
import "./globals.css";

const handEn = Patrick_Hand({ weight: "400", subsets: ["latin"], variable: "--font-hand-en", display: "swap" });
const handAr = Marhey({ subsets: ["arabic"], variable: "--font-hand-ar", display: "swap" });
const bodyEn = Nunito({ subsets: ["latin"], variable: "--font-body-en", display: "swap" });
const bodyAr = IBM_Plex_Sans_Arabic({ weight: ["400", "500", "600", "700"], subsets: ["arabic"], variable: "--font-body-ar", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Wasl — AI career platform", template: "%s · Wasl" },
  description: "Document an achievement once. Wasl turns it into LinkedIn posts, CV updates, tailored CVs and a learning roadmap — nothing invented.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1b2e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${handEn.variable} ${handAr.variable} ${bodyEn.variable} ${bodyAr.variable} h-full antialiased`}>
      <head>
        {/* set theme + direction before first paint (no light→dark flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('wasl.theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;var l=localStorage.getItem('wasl.locale');if(l==='ar'){document.documentElement.lang='ar';document.documentElement.dir='rtl'}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <RoughFilterDefs />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
