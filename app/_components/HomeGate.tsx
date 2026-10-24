"use client";

import { BirthdayPopup } from "./BirthdayPopup";
import { AnnouncementPopup } from "./AnnouncementPopup";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./AppSession";
import { Dashboard } from "./Dashboard";
import { PageShell } from "./PageShell";

// Shown once per browser tab, like the app's splash when it starts.
const SPLASH_KEY = "migwith.splashShown";
const SPLASH_MS = 1400;

export function Splash() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sky-app px-6 text-white">
      <img
        src="/icon-512.png"
        alt=""
        width={112}
        height={112}
        className="h-28 w-28 rounded-[28px] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
      />
      <h1 className="mt-6 text-5xl font-black tracking-tight">
        MIG<span className="text-amber-200">life</span>
      </h1>
      <p className="mt-3 text-sm uppercase tracking-[0.35em] text-white/85">Connect · Chat · Play</p>
      <div className="mt-12 flex gap-1.5" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-pulse rounded-full bg-white/90"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </main>
  );
}

/* "/" — splash, then the signed-in home (Dashboard) or, signed out, the login screen. */
export function HomeGate() {
  const { user, loading, username } = useSession();
  const [announcementDone, setAnnouncementDone] = useState(false);
  const router = useRouter();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SPLASH_KEY) === "1";
    } catch {
      // storage blocked
    }
    if (seen) {
      setSplashDone(true);
      return;
    }
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(SPLASH_KEY, "1");
      } catch {
        // storage blocked
      }
      setSplashDone(true);
    }, SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (splashDone && !loading && !user) router.replace("/login");
  }, [splashDone, loading, user, router]);

  if (!splashDone || loading || !user) return <Splash />;
  return (
    <PageShell light>
      <Dashboard />
      {/* 🎉 the newest announcement once per visit, then 🎂 today's birthdays */}
      <AnnouncementPopup username={username} onDone={() => setAnnouncementDone(true)} />
      {announcementDone && <BirthdayPopup username={username} />}
    </PageShell>
  );
}
