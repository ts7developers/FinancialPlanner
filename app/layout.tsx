import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { PAPER, NAVY } from "@/lib/theme";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "The Reconciliation — West Carr & Harvey",
  description: "Fortnightly plan-vs-actual finance reconciliation.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Reconciliation",
  },
};

export const viewport: Viewport = {
  themeColor: NAVY,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body style={{ background: PAPER, margin: 0 }}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
