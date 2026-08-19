import type { Metadata } from "next";
import { Fraunces, Inter, Sora } from "next/font/google";
import { NAME_STUDIO } from "@/lib/brand";
import "@/styles/globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: NAME_STUDIO,
  description: "Internal operating system for Kell Systems Consulting LLC.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${sora.variable} ${inter.variable}`}
    >
      <body className="min-h-screen bg-cream font-body text-navy antialiased">
        {children}
      </body>
    </html>
  );
}
