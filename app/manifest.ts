import type { MetadataRoute } from "next";
import { NAVY, PAPER } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Reconciliation — West Carr & Harvey",
    short_name: "The Reconciliation",
    description: "Fortnightly plan-vs-actual finance reconciliation.",
    start_url: "/overview",
    display: "standalone",
    background_color: PAPER,
    theme_color: NAVY,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
