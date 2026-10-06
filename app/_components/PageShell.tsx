import { DesktopSidebar } from "./SideMenu";
import { TopBar } from "./TopBar";

/* Page frame shared by every signed-in page: the app's white top bar over a
   sky background (and on laptops the menu as a left sidebar).
   `light` pages use the app's pale sky page with white cards;
   the others keep the deeper sky with blue cards. */
export function PageShell({
  children,
  light = false,
  pale = false,
  noTopBar = false,
}: {
  children: React.ReactNode;
  light?: boolean;
  /** A much lighter sky (Edit Profile, like the app). */
  pale?: boolean;
  /** The page has its own bar (the profile page, like the app). */
  noTopBar?: boolean;
  /** Kept for older callers; the ☰ menu replaced the phone bottom bar. */
  bottomNav?: boolean;
}) {
  return (
    <main
      // min-h-dvh (the screen as it is now), not 100vh: on Android Chrome 100vh
      // also counts the space behind the address bar, so the chat pages could
      // scroll a little and leave a gap under the message box.
      className={`relative min-h-dvh overflow-x-clip ${
        pale
          ? "bg-gradient-to-b from-[#F4FAFE] to-[#EAF5FD] text-[#0B2A5B]"
          : light
            ? "bg-gradient-to-b from-[#D6ECFB] to-[#BFE0F7] text-[#0B2A5B]"
            : "bg-sky-app text-white"
      }`}
    >
      {!noTopBar && (
        <header className="sticky top-0 z-30 border-b border-[#BFD7F2] bg-white shadow-sm">
          <TopBar />
        </header>
      )}

      {/* Laptop: the menu stays open on the left and the page fills the rest. */}
      <div className="relative z-10 lg:flex">
        <DesktopSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
