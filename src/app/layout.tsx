import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = "Noema";
const appDescription = "Noema is a calm, local-first communication and intelligence app.";
const themeColor = "#090f25";

export const metadata: Metadata = {
  title: appName,
  description: appDescription,
  applicationName: appName,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: appName,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
