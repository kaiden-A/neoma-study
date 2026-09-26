import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { Providers } from "@/components/Providers";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeScript } from "@/components/ThemeScript";

import "./globals.css";

// The prototype's three families, self-hosted by next/font. globals.css points
// the --font-* tokens at these variables.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Neoma · Study OS",
  description:
    "Neoma — a study OS for group projects and personal notes. Shared task boards, deadline reminders, your study notes and one calendar on the home screen.",
  applicationName: "Neoma",
  appleWebApp: {
    capable: true,
    title: "Neoma",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23171C1A'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%23EFF1EC' stroke-width='1.2' opacity='.6'/%3E%3Cpath d='M16 7 A9 9 0 0 1 16 25 A4.6 9 0 0 0 16 7 Z' fill='%23E0B93F'/%3E%3C/svg%3E",
        type: "image/svg+xml",
      },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFF1EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1317" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <ThemeScript />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
          referrerPolicy="no-referrer"
          precedence="default"
        />
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
