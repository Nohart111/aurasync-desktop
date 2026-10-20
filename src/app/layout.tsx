// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Roboto_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-jakarta",
  weight: ["600", "700", "800"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin", "vietnamese"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AuraSound â€” Hi-Fi Lossless Social Audio Workspace",
  description: "A Hi-Fi lossless social audio workspace for music listeners.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="vi" className={`${inter.variable} ${jakarta.variable} ${robotoMono.variable} dark`}>
      <body suppressHydrationWarning className="font-sans h-screen w-screen overflow-hidden bg-[#050508]">
        {children}
      </body>
    </html>
  );
}

