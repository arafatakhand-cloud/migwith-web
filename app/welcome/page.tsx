import type { Metadata } from "next";
import { DownloadButton, PhoneMock, WebLink } from "./LandingParts";

// The miGlife landing page: miglife.app shows it at "/" (middleware.ts), and
// web.miglife.app keeps it at /welcome (the login logo links here).

export const metadata: Metadata = {
  title: "miGlife — Chat. Play. Level up.",
  description:
    "miGlife is a free social chat app: live chat rooms, friends and private chat, gifts, levels and games like Cricket, Ludo, 29 and Teen Patti. On Android and the web.",
};

const FEATURES: { icon: string; title: string; text: string; tint: string }[] = [
  { icon: "💬", title: "Live chat rooms", text: "Join country, city and fun rooms, or make your own. Fun commands like /hug, /gn and 200 more.", tint: "#E3F0FD" },
  { icon: "🎮", title: "Games in the room", text: "Cricket, Ludo, 29, Teen Patti, LowCard, Trivia and more — play with everyone in the room.", tint: "#EDE7FE" },
  { icon: "🎁", title: "Gifts & gift showers", text: "Send a gift to a friend, or shower the whole room. Every gift shows up in the chat.", tint: "#FFE6F2" },
  { icon: "⭐", title: "Levels & badges", text: "Chat, join rooms and send gifts to earn XP. Level up and unlock new badges.", tint: "#FFF4D6" },
  { icon: "👥", title: "Friends & private chat", text: "Add friends, see who's online, chat one-to-one, send photos, voice and mail.", tint: "#E2F6EA" },
  { icon: "✨", title: "Your own style", text: "Entry effects when you walk in, colour themes and the classic look if you like it.", tint: "#FDEBDF" },
];

const GAMES = ["🏏 Cricket", "🎲 Ludo", "🃏 29", "♠️ Teen Patti", "🂠 LowCard", "🧠 Trivia", "🍀 Lucky User", "👑 Royale"];

const STEPS: { n: string; title: string; text: string }[] = [
  { n: "1", title: "Get miGlife", text: "Download the Android app, or open it right here in your browser." },
  { n: "2", title: "Create your ID", text: "Pick a username and a password. No phone number needed." },
  { n: "3", title: "Join a room", text: "Say hi, make friends, send a gift or start a game." },
];

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-1" data-notranslate>
      <span className={`font-black tracking-tight text-[#1F74C4] ${small ? "text-xl" : "text-2xl"}`}>mig</span>
      <span className={`rounded-full bg-gradient-to-b from-[#F58A3A] to-[#D6521A] font-black text-white ${small ? "px-1.5 text-[11px]" : "px-2 text-xs"}`}>
        life
      </span>
    </span>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#F7FBFF] text-[#0B2A5B]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E3ECF7] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <a href="#top" aria-label="miGlife">
            <Logo />
          </a>
          <nav className="ml-auto hidden items-center gap-7 text-sm font-semibold text-[#41597A] md:flex">
            <a href="#features" className="hover:text-[#1F74C4]">Features</a>
            <a href="#games" className="hover:text-[#1F74C4]">Games</a>
            <a href="#how" className="hover:text-[#1F74C4]">How it works</a>
            <a href="#download" className="hover:text-[#1F74C4]">Download</a>
          </nav>
          <WebLink
            path="/login"
            className="ml-auto rounded-full bg-[#1F74C4] px-4 py-2 text-sm font-bold text-white shadow-md shadow-[#1F74C4]/25 hover:bg-[#1A64AA] md:ml-0"
          >
            Open web
          </WebLink>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[780px] -translate-x-1/2 rounded-full bg-[#56CCF2]/20 blur-[120px]" />
          <div className="absolute -right-32 top-40 h-[360px] w-[360px] rounded-full bg-[#F2994A]/15 blur-[110px]" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#FFD8B8] bg-[#FFF3E8] px-3.5 py-1.5 text-xs font-bold text-[#C2541A]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#F07A00]" />
              Free · Android & web
            </span>
            <h1 className="mt-5 text-[44px] font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Chat. Play.
              <br />
              <span className="bg-gradient-to-r from-[#F07A00] to-[#E5484D] bg-clip-text text-transparent">Level up.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#41597A] sm:text-lg lg:mx-0">
              miGlife is the place to hang out with friends: live chat rooms, gifts, levels and games you play right
              inside the chat — all in one app.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <DownloadButton />
              <WebLink
                path="/login"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#BFD7F2] bg-white px-5 py-3.5 font-bold text-[#1F74C4] shadow-sm transition hover:-translate-y-0.5 hover:border-[#1F74C4]"
              >
                🌐 Use it in your browser
              </WebLink>
            </div>
            <p className="mt-4 text-xs text-[#6B7F99]">On iPhone? Open the web version in Safari and tap Share → “Add to Home Screen”.</p>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-[#E3ECF7] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-center text-xs font-extrabold uppercase tracking-[0.2em] text-[#F07A00]">Features</p>
          <h2 className="mt-2 text-center text-3xl font-black tracking-tight sm:text-4xl">Everything in one app</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[#41597A]">From a quick hello to a full cricket match — miGlife has it in the chat.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-3xl border border-[#E3ECF7] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: f.tint }}>
                  {f.icon}
                </span>
                <h3 className="mt-4 text-lg font-black">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#41597A]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" className="scroll-mt-20 bg-gradient-to-br from-[#0E2A52] to-[#1F4F94] text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Games in the chat room</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">No extra apps — start a game in the room and everyone can join.</p>
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2.5">
            {GAMES.map((g) => (
              <span key={g} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold">
                {g}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-[#F7FBFF]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-center text-xs font-extrabold uppercase tracking-[0.2em] text-[#F07A00]">How it works</p>
          <h2 className="mt-2 text-center text-3xl font-black tracking-tight sm:text-4xl">Up and chatting in a minute</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-3xl border border-[#E3ECF7] bg-white p-6 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1F74C4] text-lg font-black text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-black">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#41597A]">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="scroll-mt-20 px-4 pb-16 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-gradient-to-br from-[#F58A3A] via-[#F07A00] to-[#E5484D] px-6 py-12 text-center text-white shadow-xl shadow-[#F07A00]/25 sm:px-12">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Join miGlife today</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/90">It&apos;s free. Get the Android app, or start right now in your browser.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DownloadButton big />
            <WebLink
              path="/register"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-lg font-black text-[#C2541A] shadow-lg transition hover:-translate-y-0.5"
            >
              ✨ Create your ID
            </WebLink>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E3ECF7] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-sm text-[#6B7F99] sm:flex-row sm:px-6">
          <Logo small />
          <span>Chat · Play · Make friends</span>
          <div className="flex gap-5 sm:ml-auto">
            <WebLink path="/login" className="hover:text-[#1F74C4]">Log in</WebLink>
            <WebLink path="/register" className="hover:text-[#1F74C4]">Sign up</WebLink>
            <a href="#download" className="hover:text-[#1F74C4]">Download</a>
          </div>
          <span className="text-xs sm:ml-4">© {new Date().getFullYear()} miGlife</span>
        </div>
      </footer>
    </main>
  );
}
