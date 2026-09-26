import { TopBar } from "./TopBar";

/* Navy MIGwith background + the app-style top bar, shared by every page. */
// `bottomNav` is kept for older callers; the ☰ menu and 🏠/💬 tabs replaced the phone bottom bar.
export function PageShell({ children }: { children: React.ReactNode; bottomNav?: boolean }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0a1440] via-[#0b1a4f] to-[#081236] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-250px] h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a1440]/85 backdrop-blur-xl">
        <TopBar />
      </header>

      <div className="relative z-10">{children}</div>
    </main>
  );
}
