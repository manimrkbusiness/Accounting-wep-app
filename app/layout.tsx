import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NumberInputGuard } from "./NumberInputGuard";
import { LanguageProvider } from "./lib/i18n";
import { Analytics } from "./Analytics";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://bizztrack.in"),
  title: "BizzTrack — Coconut trading, organised",
  description: "The simplest way for coconut traders to record purchases, stock, sales, husk and cash — and know their profit. Built for South Indian coconut traders."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body><NumberInputGuard /><Analytics /><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
