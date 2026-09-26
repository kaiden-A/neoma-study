import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Installability on Android/desktop needs
// name + icons (192 & 512, one maskable) + start_url + display, and any
// service worker with a fetch handler (see public/sw.js).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Neoma · Study OS",
    short_name: "Neoma",
    description:
      "A study OS for group projects and personal notes: shared task boards, study notes, deadlines and one calendar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EFF1EC",
    theme_color: "#171C1A",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Notes", short_name: "Notes", url: "/vault" },
      { name: "Calendar", short_name: "Calendar", url: "/calendar" },
      { name: "Groups", short_name: "Groups", url: "/groups" },
    ],
  };
}
