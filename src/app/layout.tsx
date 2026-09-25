import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["400", "500", "600", "700"] });

// This is a fully authenticated, per-user internal tool — nothing here is
// safe to prerender at build time (every page reads the session and/or the
// database). Force dynamic rendering everywhere instead of letting Next.js
// guess per-route.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NerdFlow Sales Command Center",
  description: "NerdFlow's daily operating system for the sales team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('nf-theme')==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans text-[15px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
