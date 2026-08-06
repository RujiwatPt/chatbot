import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import Nav from "./Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Warm display serif for headings and character names — echoes the serif used
// for roleplay *actions* and gives the app a literary, intimate character.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "Howly.ai",
  description: "Persistent-memory roleplay with your own AI companions.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the on-screen keyboard resize the layout so the sticky composer stays
  // above it instead of being overlapped.
  interactiveWidget: "resizes-content",
  // Required for env(safe-area-inset-*) to report real values (notch / home bar).
  viewportFit: "cover",
};

import { headers } from "next/headers";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var saved=localStorage.getItem("howly-theme");var theme=saved==="light"||saved==="dark"?saved:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.style.colorScheme=theme;}catch(error){document.documentElement.dataset.theme="light";document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}})();`,
          }}
        />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden">
        <Nav />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
