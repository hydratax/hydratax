import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Inter, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";
import { defaultMetadata } from "@/lib/seo";
import { NavPendingReset } from "@/components/nav-pending-reset";
import { BookDemoFab } from "@/components/demo/book-demo-fab";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

/** PAYE money / IDs — modern proportional sans (plain zero, tabular lining figures). */
const payeDigits = Inter({
  variable: "--font-paye-digits",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  ...defaultMetadata,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HydraTax",
  },
  formatDetection: {
    telephone: false,
  },
  // Impact.com site verification (head meta; harmless on all pages)
  other: {
    "impact-site-verification": "a3f506aa-df90-4d87-9c56-5ce2a6e7e42b",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0f766e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const body = (
    <html lang="en-GB">
      <body
        className={`${dmSans.variable} ${fraunces.variable} ${sourceSerif.variable} ${payeDigits.variable} antialiased`}
      >
        <NavPendingReset />
        {children}
        <BookDemoFab />
      </body>
    </html>
  );

  if (isClerkConfigured()) {
    return <ClerkProvider>{body}</ClerkProvider>;
  }

  return body;
}
