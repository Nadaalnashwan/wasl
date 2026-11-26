import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Nunito } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

// Nunito is Wasl's original typeface (v1): rounded and warm, used at confident weights for headings and UI
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-nunito", display: "swap" });
const plexAr = IBM_Plex_Sans_Arabic({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-plex-ar",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Wasl — evidence-grounded career workspace", template: "%s · Wasl" },
  description:
    "Document an achievement once. Use it everywhere. Wasl keeps a verified Master CV and turns confirmed achievements into LinkedIn posts, tailored CVs and skill-gap plans — every claim checked against your evidence.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef4fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1b2e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${nunito.variable} ${plexAr.variable} h-full antialiased`}>
      <head>
        {/* set theme + direction before first paint (no light→dark flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('wasl.theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;var l=localStorage.getItem('wasl.locale');if(l==='ar'){document.documentElement.lang='ar';document.documentElement.dir='rtl'}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-surface-elevated focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
