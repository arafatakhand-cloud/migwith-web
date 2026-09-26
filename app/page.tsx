import Link from "next/link";
import { HeaderAuth, HeroActions } from "./_components/AuthControls";

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050b1c] text-white">
      {/* Background Glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-250px] h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[140px]" />

        <div className="absolute bottom-[-200px] left-[-150px] h-[450px] w-[450px] rounded-full bg-cyan-500/10 blur-[120px]" />

        <div className="absolute right-[-150px] top-[35%] h-[400px] w-[400px] rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-[#050b1c]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/20">
              <span className="text-xl font-black">M</span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-wide">
                MIG<span className="text-cyan-300">with</span>
              </h1>

              <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                Connect • Chat • Play
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm text-white/70 transition hover:text-white"
            >
              Features
            </a>

            <a
              href="#about"
              className="text-sm text-white/70 transition hover:text-white"
            >
              About
            </a>

            <a
              href="#download"
              className="text-sm text-white/70 transition hover:text-white"
            >
              Download
            </a>
          </nav>

          {/* Login */}
          <HeaderAuth />
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10">
        <div className="mx-auto flex min-h-[calc(100vh-82px)] max-w-7xl flex-col items-center justify-center px-6 py-20 text-center lg:px-10">

          {/* Badge */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-4 py-2 text-xs font-medium text-cyan-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
            Welcome to MIGwith
          </div>

          {/* Title */}
          <h2 className="max-w-5xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-8xl">
            Your world.
            <br />

            <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              Your community.
            </span>
          </h2>

          {/* Description */}
          <p className="mt-7 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
            Connect with people, discover rooms, chat, share gifts,
            play games and experience the world of MIGwith.
          </p>

          {/* Buttons */}
          <HeroActions />

          {/* Feature Cards */}
          <div
            id="features"
            className="mt-20 grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <Feature
              icon="💬"
              title="Chat"
              description="Connect"
            />

            <Feature
              icon="🌍"
              title="Rooms"
              description="Explore"
            />

            <Feature
              icon="🎁"
              title="Gifts"
              description="Share"
            />

            <Feature
              icon="🎮"
              title="Games"
              description="Play"
            />
          </div>

          {/* Bottom Line */}
          <div className="mt-16 flex items-center gap-3 text-xs text-white/30">
            <span className="h-px w-10 bg-white/10" />
            MIGwith
            <span className="h-px w-10 bg-white/10" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 px-6 py-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} MIGwith. All rights reserved.
      </footer>
    </main>
  );
}

/* Feature Card */
function Feature({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-white/[0.07]">

      <div className="text-2xl">
        {icon}
      </div>

      <div className="mt-3 font-bold text-white">
        {title}
      </div>

      <div className="mt-1 text-xs text-white/40">
        {description}
      </div>

    </div>
  );
}
