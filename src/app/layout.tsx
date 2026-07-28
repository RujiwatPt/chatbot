import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Roleplay Chatbot",
  description: "Persistent-memory roleplay with your own characters.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <Nav />
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
