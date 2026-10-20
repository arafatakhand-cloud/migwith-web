import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./themes.css";
import { AppSession } from "./_components/AppSession";
import { ReportDialogHost } from "./_components/ReportDialog";
import { Translator } from "./_components/Translator";
import { BrandName } from "./_components/BrandName";
import { RainbowFavicon } from "./_components/RainbowFavicon";
import { LoginWelcomeSplash } from "./_components/LoginWelcome";
import { BootSplash } from "./_components/BootSplash";
import { BOOT_SPLASH_SCRIPT } from "../lib/bootSplash";

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
        {/* 📱 Every phone shows the page the same: it is laid out 412px wide (a
            normal phone) and the phone scales that to its own screen, so a small
            or a big phone shows the same lines, the same wrapping, the same sizes —
            like the app. Tablets / computers (and a phone turned sideways) keep
            their own width. (Next.js adds its own viewport tag again after the
            page starts, so every viewport tag is kept in step.) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var W=412;function want(){var w=Math.min(screen.width,screen.height),land=screen.width>screen.height,rest=", viewport-fit=cover, interactive-widget=resizes-content";return w<600&&!land?"width="+W+rest:"width=device-width, initial-scale=1"+rest}function fit(){try{var c=want();document.querySelectorAll('meta[name="viewport"]').forEach(function(m){if(m.getAttribute("content")!==c)m.setAttribute("content",c)})}catch(e){}}fit();try{new MutationObserver(fit).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:["content"]})}catch(e){}addEventListener("orientationchange",function(){setTimeout(fit,50)})})()`,
          }}
        />
        {/* The font chosen in Settings › Appearance, applied before the page shows. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.removeItem("migwith.font");var t=localStorage.getItem("migwith.theme");if(t&&t!=="sky_blue")document.documentElement.dataset.theme=t;if(localStorage.getItem("migwith.uiStyle")==="classic")document.documentElement.dataset.ui="classic"}catch(e){}`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_SCRIPT }} />
        {/* 📲 Chrome's "install this app" offer comes once, often before React is
            ready: keep it for the Install miGlife button on Home (InstallHint). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__migInstall=e;window.dispatchEvent(new Event("mig-install"))})`,
          }}
        />
        <BootSplash />
        <AppSession>{children}</AppSession>
        {/* 🚩 the Report dialog, opened from profiles, room lines and private chats */}
        <ReportDialogHost />
        <Translator />
        <BrandName />
        <RainbowFavicon />
        <LoginWelcomeSplash />
      </body>
    </html>
  );
}
