import type { MetadataRoute } from "next";

// Lets phones install MIGlife to the home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "miGlife",
    short_name: "miGlife",
    description: "Chat rooms, gifts and games — the MIGlife community.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // ⌨️ the installed app's own window colour: it shows for a moment under the
    // page while the keyboard slides in / out (it was blue, a blue flash). Now the
    // chat's light colour, like WhatsApp — the page just seems to go on.
    background_color: "#F3F5F9",
    theme_color: "#0B1F3A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
