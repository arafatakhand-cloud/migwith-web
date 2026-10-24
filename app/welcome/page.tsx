import type { Metadata } from "next";
import { DownloadButton, LiveDemo, RotatingWord, WebLink } from "./LandingParts";

// The miGlife landing page: miglife.app shows it at "/" (middleware.ts), and
// web.miglife.app keeps it at /welcome (the login logo links here).

export const metadata: Metadata = {
  title: "miGlife — Chat. Play. Level up.",
  description:
    "miGlife is a free social chat app: live chat rooms, friends and private chat, gifts, levels and games like Cricket, Ludo, 29 and Teen Patti. On Android and the web.",
};

const COMMANDS = ["/hug", "/gn", "/gm", "/love", "/highfive", "/rose", "/cake", "/dance", "/8ball", "/roll", "/hbd", "/cheers", "/wave", "/teddy", "/crown", "/poetry", "/ty", "/boo"];

const GAMES: { icon: string; name: string; from: string; to: string }[] = [
  { icon: "🏏", name: "Cricket", from: "#22C55E", to: "#15803D" },
  { icon: "🎲", name: "Ludo", from: "#F59E0B", to: "#DC2626" },
  { icon: "🃏", name: "29", from: "#6366F1", to: "#4338CA" },
  { icon: "♠️", name: "Teen Patti", from: "#EC4899", to: "#9D174D" },
  { icon: "🂠", name: "LowCard", from: "#06B6D4", to: "#0E7490" },
  { icon: "🧠", name: "Trivia", from: "#A855F7", to: "#6B21A8" },
];

const BADGES = ["🥚", "🥈", "🥇", "💎", "🔥", "👑", "🏆"];

// "miG" + the orange "life" pill.
function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-1" data-notranslate>
      <span className={`font-black tracking-tight text-[#0B2A5B] ${small ? "text-xl" : "text-2xl"}`}>miG</span>
      <span
        className={`rounded-full bg-gradient-to-b from-[#FF9A4D] to-[#E5541A] font-black text-white shadow-[0_2px_8px_rgba(229,84,26,0.45)] ${
          small ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs"
        }`}
      >
        life
      </span>
    </span>
  );
}

// 🫧 clear 3D glass cards on the Lobby sky (classes in globals.css)
const card = "lp-glass relative overflow-hidden rounded-[28px] p-6";

export default function Landing() {
  return (
    <main className="lp-sky relative min-h-screen overflow-x-clip text-[#0B2A5B]">
      {/* aurora */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1100px] overflow-hidden">
        <div className="lp-aurora absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-white/70 blur-[120px]" />
        <div className="lp-aurora-2 absolute -right-32 top-20 h-[460px] w-[460px] rounded-full bg-[#9FDDFB]/50 blur-[120px]" />
        <div className="lp-aurora absolute left-1/3 top-[520px] h-[380px] w-[380px] rounded-full bg-[#FFD9A8]/40 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(31,116,196,0.10)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className="mx-auto mt-3 lp-glass flex max-w-6xl items-center gap-4 rounded-full px-4 py-2.5 sm:mx-6 lg:mx-auto">
          <a href="#top" aria-label="miGlife">
            <Logo />
          </a>
          <nav className="ml-auto hidden items-center gap-7 text-sm font-semibold text-[#24416B] md:flex">
            <a href="#features" className="hover:text-[#1F74C4]">Features</a>
            <a href="#games" className="hover:text-[#1F74C4]">Games</a>
            <a href="#start" className="hover:text-[#1F74C4]">Get started</a>
          </nav>
          <WebLink
            path="/login"
            className="lp-btn3d ml-auto rounded-full px-4 py-1.5 text-sm font-bold md:ml-0"
          >
            Log in
          </WebLink>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="lp-glass-soft inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#24416B]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3DDC84] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3DDC84]" />
              </span>
              Live chat · games · gifts
            </span>
            <h1 className="mt-6 text-[46px] font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-[76px]">
              Come in.
              <br />
              Say hi.
              <br />
              <RotatingWord />
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#24416B] sm:text-lg lg:mx-0">
              miGlife is your hangout: live chat rooms, real friends, gifts that light up the room and games you play
              right inside the chat.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <DownloadButton />
              <WebLink
                path="/register"
                className="lp-btn3d group inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 font-bold transition hover:-translate-y-0.5"
              >
                Start in your browser
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </WebLink>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-[#24416B] lg:justify-start">
              <span className="lp-glass-soft rounded-full px-3 py-1">✓ Free</span>
              <span className="lp-glass-soft rounded-full px-3 py-1">✓ No phone number</span>
              <span className="lp-glass-soft rounded-full px-3 py-1">✓ Android & web</span>
            </div>
          </div>
          <LiveDemo />
        </div>

        {/* command marquee */}
        <div className="relative border-y border-white/80 bg-white/25 py-3 backdrop-blur-md [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="lp-marquee flex w-max gap-3">
            {[...COMMANDS, ...COMMANDS].map((c, i) => (
              <span key={i} className="lp-glass-soft rounded-full px-3.5 py-1 font-mono text-sm font-semibold text-[#155A9E]">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bento features */}
      <section id="features" className="relative scroll-mt-24">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">
            Not just chat.
            <span className="block text-[#1F74C4]">A whole little world.</span>
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {/* Rooms */}
            <div className={`${card} md:col-span-4`}>
              <p className="text-sm font-bold text-[#1F74C4]">💬 Live rooms</p>
              <h3 className="mt-1 text-2xl font-black">Find your crowd</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#24416B]">Country, city, game and fun rooms — or make your own. 200+ fun commands keep it lively.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {[
                  ["🇧🇩", "Bangladesh", "#3DDC84"],
                  ["🏏", "Cricket", "#FFB547"],
                  ["🏙️", "Ctg", "#C86BFA"],
                  ["💬", "Chat", "#5AA8FF"],
                ].map(([i, n, c]) => (
                  <div key={n} className="lp-glass-soft flex items-center gap-3 rounded-2xl px-3 py-2.5">
                    <span className="text-lg">{i}</span>
                    <span className="font-bold">{n}</span>
                    <span className="ml-auto h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
                  </div>
                ))}
              </div>
            </div>
            {/* Levels */}
            <div className={`${card} md:col-span-2`}>
              <p className="text-sm font-bold text-[#A86400]">⭐ Levels</p>
              <h3 className="mt-1 text-2xl font-black">Level up</h3>
              <p className="mt-2 text-sm leading-6 text-[#24416B]">Chat, join rooms and send gifts to earn XP.</p>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/50 shadow-[inset_0_1px_2px_rgba(40,80,140,.15)]">
                <div className="lp-xp h-full rounded-full bg-gradient-to-r from-[#FFB547] to-[#FF6B6B]" />
              </div>
              <div className="mt-4 flex justify-between text-xl">
                {BADGES.map((b) => (
                  <span key={b}>{b}</span>
                ))}
              </div>
            </div>
            {/* Gifts */}
            <div className={`${card} md:col-span-2`}>
              <div className="pointer-events-none absolute inset-0">
                {["🌹", "🎂", "💎", "🧸", "👑", "🍫"].map((g, i) => (
                  <span key={g} className="lp-fall absolute text-xl opacity-80" style={{ left: `${70 + (i % 3) * 10}%`, animationDelay: `${i * 0.7}s` }}>
                    {g}
                  </span>
                ))}
              </div>
              <p className="relative text-sm font-bold text-[#C2256E]">🎁 Gifts</p>
              <h3 className="relative mt-1 max-w-[66%] text-2xl font-black">Make it rain</h3>
              <p className="relative mt-2 max-w-[66%] text-sm leading-6 text-[#24416B]">Send a gift to one friend — or shower the whole room.</p>
            </div>
            {/* Friends */}
            <div className={`${card} md:col-span-2`}>
              <p className="text-sm font-bold text-[#18793A]">👥 Friends</p>
              <h3 className="mt-1 text-2xl font-black">Your people</h3>
              <p className="mt-2 text-sm leading-6 text-[#24416B]">Private chat, photos, voice notes and mail.</p>
              <div className="mt-5 flex -space-x-3">
                {[
                  ["N", "#FF6B8A"],
                  ["R", "#5AA8FF"],
                  ["S", "#3DDC84"],
                  ["T", "#FFB547"],
                  ["A", "#C86BFA"],
                ].map(([l, c]) => (
                  <span key={l} className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-white text-sm font-black text-white" style={{ background: c }}>
                    {l}
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#3DDC84]" />
                  </span>
                ))}
              </div>
            </div>
            {/* Style */}
            <div className={`${card} md:col-span-2`}>
              <p className="text-sm font-bold text-[#6D4BD8]">✨ Style</p>
              <h3 className="mt-1 text-2xl font-black">Make an entrance</h3>
              <p className="mt-2 text-sm leading-6 text-[#24416B]">Entry effects, colour themes and the classic look.</p>
              <div className="lp-glass-soft mt-5 rounded-2xl px-3 py-2.5 text-sm font-bold">
                <span className="lp-sparkle inline-block">✨</span> nila [32] has entered.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" className="scroll-mt-24">
        <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
              Games, right
              <span className="block bg-gradient-to-r from-[#E8590C] to-[#D6336C] bg-clip-text text-transparent">in the chat.</span>
            </h2>
            <p className="max-w-sm text-sm leading-6 text-[#24416B]">No extra apps. Start a game in the room and everyone can jump in.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {GAMES.map((g) => (
              <div
                key={g.name}
                className="lp-gloss group relative overflow-hidden rounded-3xl p-4 text-white transition hover:-translate-y-1"
                style={{ background: `linear-gradient(145deg, ${g.from}, ${g.to})` }}
              >
                <span className="absolute -right-3 -top-3 text-6xl opacity-25 transition group-hover:scale-110">{g.icon}</span>
                <span className="relative text-3xl">{g.icon}</span>
                <p className="relative mt-6 text-lg font-black">{g.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get started */}
      <section id="start" className="scroll-mt-24 px-4 pb-20 sm:px-6">
        <div className="lp-glass relative mx-auto max-w-6xl overflow-hidden rounded-[36px] px-6 py-14 text-[#0B2A5B] sm:px-12">
          <div className="lp-aurora pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#FF8A3D]/30 blur-[100px]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Your seat is waiting.</h2>
              <p className="mt-4 max-w-md text-[#35507E]">Three steps and you&apos;re in a room.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <DownloadButton big />
                <WebLink
                  path="/register"
                  className="lp-btn3d inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-black transition hover:-translate-y-0.5"
                >
                  ✨ Create your ID
                </WebLink>
              </div>
            </div>
            <ol className="space-y-3">
              {[
                ["Get miGlife", "Download the Android app or open it in your browser."],
                ["Create your ID", "A username and a password — that's it."],
                ["Join a room", "Say hi, send a gift, start a game."],
              ].map(([t, d], i) => (
                <li key={t} className="lp-glass-soft flex items-start gap-4 rounded-2xl p-4">
                  <span className="lp-btn3d flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-black">{i + 1}</span>
                  <span>
                    <span className="block font-black">{t}</span>
                    <span className="block text-sm text-[#35507E]">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="mx-auto mt-5 max-w-6xl text-center text-xs text-[#24416B]">
          On iPhone? Open the web version in Safari and tap Share → “Add to Home Screen”.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/80 bg-white/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-sm text-[#24416B] sm:flex-row sm:px-6">
          <Logo small />
          <span>Chat · Play · Make friends</span>
          <div className="flex gap-5 sm:ml-auto">
            <WebLink path="/login" className="hover:text-[#1F74C4]">Log in</WebLink>
            <WebLink path="/register" className="hover:text-[#1F74C4]">Sign up</WebLink>
          </div>
          <span className="text-xs sm:ml-4">© {new Date().getFullYear()} miGlife</span>
        </div>
      </footer>
    </main>
  );
}
