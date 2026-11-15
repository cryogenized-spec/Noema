import type { MetadataRoute } from "next";

// A deterministic web manifest is compatible with the bundled Android static export.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NOEMA",
    short_name: "NOEMA",
    description: "A calm, local-first communication and intelligence app.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070707",
    theme_color: "#070707",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
