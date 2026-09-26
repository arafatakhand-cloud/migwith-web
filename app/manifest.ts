import type { MetadataRoute } from "next";

// Lets phones install MIGwith to the home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MIGwith",
    short_name: "MIGwith",
    description: "Chat rooms, gifts and games — the MIGwith community.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050b1c",
    theme_color: "#050b1c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
