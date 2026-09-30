import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "./providers";

// Authenticated internal tool — nothing is safe to prerender at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NerdFlow Sales Command Center",
  description: "NerdFlow's daily operating system for the sales team.",
  icons: {
    icon: "/brand/logo-mark-128.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('nf-theme')==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
          }}
        />
      </head>
      <body className={`${GeistSans.className} font-sans text-[15px] leading-relaxed antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
