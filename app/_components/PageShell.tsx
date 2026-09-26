import Link from "next/link";
import { HeaderAuth } from "./AuthControls";
import { BottomNav } from "./BottomNav";

/* Dark MIGwith background + header shared by the signed-in pages. */
// Full-screen chat pages (room, private chat) turn the phone bottom bar off.
export function PageShell({ children, bottomNav = true }: { children: React.ReactNode; bottomNav?: boolean }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b1c] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-250px] h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[140px]" />
        <div className="absolute bottom-[-200px] left-[-150px] h-[450px] w-[450px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-[#050b1c]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/20">
              <span className="text-lg font-black">M</span>
            </div>
            <span className="text-xl font-black tracking-wide">
              MIG<span className="text-cyan-300">with</span>
            </span>
          </Link>

          <HeaderAuth />
        </div>
      </header>

      <div className={`relative z-10 ${bottomNav ? "pb-20 sm:pb-0" : ""}`}>{children}</div>
      {bottomNav && <BottomNav />}
    </main>
  );
}
