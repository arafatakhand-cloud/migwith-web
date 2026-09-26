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
  appleWebApp: { capable: true, title: "MIGwith", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Matches the white top bar (iPhone Safari tints its bar with this).
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: the keyboard shrinks the page (like an app), so the chat
  // box sits right on top of it. iPhone ignores this and uses --vvh instead.
  interactiveWidget: "resizes-content",
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
