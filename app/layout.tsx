import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppSession } from "./_components/AppSession";
import { Translator } from "./_components/Translator";

export const metadata: Metadata = {
  title: "MIGwith",
  description: "Connect with people, discover rooms, chat, share gifts and play games.",
  applicationName: "MIGwith",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // iPhone "Add to Home Screen" opens full screen, like an app.
  appleWebApp: { capable: true, title: "MIGwith", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#0B1F3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppSession>{children}</AppSession>
        <Translator />
      </body>
    </html>
  );
}
