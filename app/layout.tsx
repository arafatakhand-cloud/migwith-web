import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./themes.css";
import { AppSession } from "./_components/AppSession";
import { Translator } from "./_components/Translator";
import { BrandName } from "./_components/BrandName";
import { RainbowFavicon } from "./_components/RainbowFavicon";
import { LoginWelcomeSplash } from "./_components/LoginWelcome";

export const metadata: Metadata = {
  title: "miGlife",
  description: "Connect with people, discover rooms, chat, share gifts and play games.",
  applicationName: "miGlife",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // iPhone "Add to Home Screen" opens full screen, like an app.
  appleWebApp: { capable: true, title: "miGlife", statusBarStyle: "default" },
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* The font chosen in Settings › Appearance, applied before the page shows. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var f=localStorage.getItem("migwith.font");if(f&&f!=="modern")document.documentElement.dataset.font=f;var t=localStorage.getItem("migwith.theme");if(t&&t!=="sky_blue")document.documentElement.dataset.theme=t;if(localStorage.getItem("migwith.uiStyle")==="classic")document.documentElement.dataset.ui="classic"}catch(e){}`,
          }}
        />
        <AppSession>{children}</AppSession>
        <Translator />
        <BrandName />
        <RainbowFavicon />
        <LoginWelcomeSplash />
      </body>
    </html>
  );
}
