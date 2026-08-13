import type { MetadataRoute } from "next";

/** PWA web app manifest — installable on phones; Capacitor can wrap the same URL later. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HydraTax",
    short_name: "HydraTax",
    description:
      "UK practice desk for CT600, MTD VAT, Self Assessment, PAYE and Companies House filings.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f9",
    theme_color: "#0f766e",
    orientation: "portrait-primary",
    categories: ["business", "finance"],
    icons: [
      {
        src: "/brand/logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
