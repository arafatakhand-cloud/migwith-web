import DarkReadable from "./_components/DarkReadable";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./themes.css";
import { AppSession } from "./_components/AppSession";
import { ReportDialogHost } from "./_components/ReportDialog";
import { Translator } from "./_components/Translator";
import { BrandName } from "./_components/BrandName";
import { RainbowFavicon } from "./_components/RainbowFavicon";
import { LoginWelcomeSplash } from "./_components/LoginWelcome";
import { FbGroupPopup } from "./_components/FbGroupPopup";
import { TextStyleBar } from "./_components/TextStyleBar";
import { BootSplash } from "./_components/BootSplash";
import { SiteControlGate } from "./_components/SiteControlGate";
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
  // The phone's top status bar on every page: the blue header colour (iPhone Safari
  // and Android Chrome tint their bar with this).
  themeColor: "#0B1A33",
  // 🌙 the browser must not repaint miGlife dark on its own (Chrome "Auto dark mode",
  // Samsung Internet dark mode …) — every phone showed different colours. miGlife has
  // its own themes (Dark Night …).
  colorScheme: "only light",
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
    <html lang="en" suppressHydrationWarning data-theme="modern_light">
      <body className="antialiased">
        {/* 📱 Every phone shows the page the same: it is laid out 412px wide (a
            normal phone) and the phone scales that to its own screen, so a small
            or a big phone shows the same lines, the same wrapping, the same sizes —
            like the app. Tablets / computers (and a phone turned sideways) keep
            their own width. (Next.js adds its own viewport tag again after the
            page starts, so every viewport tag is kept in step.)
            📱 iPhone: it keeps the first zoom (1×) when the tag changes later, so a
            412px page stuck out past a smaller screen and had to be zoomed out
            (miglife: "page width is not compatible with mobile"). The tag now also
            says the zoom (screen ÷ 412), so the whole page fits the screen. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var W=412;function want(){var w=Math.min(screen.width,screen.height),land=screen.width>screen.height,rest=", viewport-fit=cover, interactive-widget=resizes-content";if(w<600&&!land){var k=Math.round(w/W*1000)/1000;return "width="+W+", initial-scale="+k+", minimum-scale="+k+rest}return "width=device-width, initial-scale=1"+rest}function fit(){try{var c=want();document.querySelectorAll('meta[name="viewport"]').forEach(function(m){if(m.getAttribute("content")!==c)m.setAttribute("content",c)})}catch(e){}}fit();try{new MutationObserver(fit).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:["content"]})}catch(e){}addEventListener("orientationchange",function(){setTimeout(fit,50)})})()`,
          }}
        />
        {/* The font chosen in Settings › Appearance, applied before the page shows. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.removeItem("migwith.font");localStorage.removeItem("migwith.uiStyle");var m=localStorage.getItem("migwith.themeMode");if(m!=="light"&&m!=="dark"&&m!=="auto")m=localStorage.getItem("migwith.theme")==="dark_night"?"dark":"auto";var q=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)");if(/^\\/feed(\\/|$)/.test(location.pathname))document.documentElement.dataset.forceLight="1";var ap=function(){var x=localStorage.getItem("migwith.themeMode")||m;var d=document.documentElement.dataset.forceLight!=="1"&&(x==="dark"||(x!=="light"&&q&&q.matches));document.documentElement.dataset.theme=d?"dark_night":"modern_light";var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",d?"#000000":"#0B1A33")};ap();if(q&&q.addEventListener)q.addEventListener("change",ap)}catch(e){}`,
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
        <SiteControlGate />
        {/* 🚩 the Report dialog, opened from profiles, room lines and private chats */}
        <ReportDialogHost />
        <Translator />
        <BrandName />
        <RainbowFavicon />
        <LoginWelcomeSplash />
        <FbGroupPopup />
        {/* ✍️ S1: select words in a text box → Copy · Paste | B · I · 🎨 · 🌐 · @ */}
        <TextStyleBar />
        {/* ⚫ Dark: light cards painted by the pages themselves turn black, dark text turns light */}
        <DarkReadable />
      </body>
    </html>
  );
}
