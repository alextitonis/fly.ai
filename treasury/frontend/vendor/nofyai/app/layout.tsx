import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { I18nProvider } from "@/lib/i18n-context";
import { AuthProvider } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AI-Powered Algorithmic Trading",
  description: "Universal AI-driven algorithmic trading operating system with multi-agent autonomous trading across cryptocurrency exchanges",
  keywords: ["AI trading", "algorithmic trading", "cryptocurrency", "DeepSeek", "Qwen", "automated trading"],
  icons: {
    icon: "/icons/icon.png",
    shortcut: "/icons/icon.png",
    apple: "icons//icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning>
        <AuthProvider>
          <I18nProvider>
            <div className="min-h-screen bg-background-secondary flex flex-col">
              <Header />
              <main className="flex-1 max-w-[1800px] mx-auto w-full">
                {children}
              </main>
              <Footer />
            </div>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
