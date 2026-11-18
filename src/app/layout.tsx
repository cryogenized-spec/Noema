import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GlobalContactNotification } from "@/components/layout/global-contact-notification";

const appName = "NOEMA";
const appDescription = "NOEMA is a local-first communication and intelligence workspace.";

export const metadata: Metadata = {
  title: appName,
  description: appDescription,
  applicationName: appName,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: appName },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.svg" }],
  },
};

export const viewport: Viewport = { themeColor: "#070707" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<GlobalContactNotification /></body>
    </html>
  );
}
