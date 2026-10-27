import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "600", "800"] });

export const metadata: Metadata = {
  title: "Pong vs a fly brain",
  description: "Play Pong against a real fruit fly connectome: 166,700 neurons, no training.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.className}>{children}</body>
    </html>
  );
}
