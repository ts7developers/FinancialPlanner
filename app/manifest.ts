import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Financial Planner",
    short_name: "Financial Planner",
    description: "Fortnightly plan-vs-actual finance reconciliation.",
    start_url: "/overview",
    display: "standalone",
    // Fixed literals, not lib/theme's CSS-variable exports — a manifest.json field isn't resolved
    // through a stylesheet, so `var(...)` would just be an invalid, meaningless string here. Same
    // light-mode brand colors as the OS splash screen regardless of the in-app theme toggle.
    background_color: "#F7F5EF",
    theme_color: "#1F2A44",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
