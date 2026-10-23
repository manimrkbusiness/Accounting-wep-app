import type { Metadata } from "next";
import "./globals.css";
import { NumberInputGuard } from "./NumberInputGuard";
import { LanguageProvider } from "./lib/i18n";
import { Analytics } from "./Analytics";

export const metadata: Metadata = {
  metadataBase: new URL("https://bizztrack.in"),
  title: "Coconut Trade Desk — Coconut trading, organised",
  description: "The simplest way for coconut traders to record purchases, stock, sales, husk and cash — and know their profit. Built for South Indian coconut traders."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><NumberInputGuard /><Analytics /><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
