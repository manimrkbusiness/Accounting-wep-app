import type { Metadata } from "next";
import "./globals.css";
import { NumberInputGuard } from "./NumberInputGuard";

export const metadata: Metadata = {
  title: "Coconut Trade Desk",
  description: "Private farmer and coconut trader purchase records"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><NumberInputGuard />{children}</body>
    </html>
  );
}
