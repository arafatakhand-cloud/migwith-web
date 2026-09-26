import { DesktopSidebar } from "./SideMenu";
import { TopBar } from "./TopBar";

/* Page frame shared by every signed-in page: the app's white top bar over a
   sky background (and on laptops the menu as a left sidebar).
   `light` pages use the app's pale sky page with white cards;
   the others keep the deeper sky with blue cards. */
export function PageShell({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
  /** Kept for older callers; the ☰ menu replaced the phone bottom bar. */
  bottomNav?: boolean;
}) {
  return (
    <main
      className={`relative min-h-screen overflow-x-clip ${
        light ? "bg-gradient-to-b from-[#D6ECFB] to-[#BFE0F7] text-[#0B2A5B]" : "bg-sky-app text-white"
      }`}
    >
      <header className="sticky top-0 z-30 border-b border-[#BFD7F2] bg-white shadow-sm">
        <TopBar />
      </header>

      {/* Laptop: the menu stays open on the left and the page fills the rest. */}
      <div className="relative z-10 lg:flex">
        <DesktopSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
