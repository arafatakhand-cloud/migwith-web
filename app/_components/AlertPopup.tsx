"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

// 🔔 A new alert (a gift, a friend request, a game invite …) pops up at the
// top of whatever page is open — also inside a room — like the app's
// notification. The 🔔 badge alone was easy to miss. Only alerts that arrive
// after the page opened pop up; Gift Shower alerts stay quiet (as on the phone).
// Tap → the alert's page; it hides by itself after a few seconds.

type Pop = { id: string; icon: string; text: string; note: string; path: string; gift: boolean };

export function AlertPopup({ username }: { username: string }) {
  const router = useRouter();
  const [pops, setPops] = useState<Pop[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    seen.current = null;
    setPops([]);
    if (!username) return;
    return onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), where("read", "==", false)),
      (snap) => {
        // the first answer = alerts that were already there: no popup for them
        if (!seen.current) {
          seen.current = new Set(snap.docs.map((d) => d.id));
          return;
        }
        const fresh: Pop[] = [];
        snap.docChanges().forEach((c) => {
          if (c.type !== "added" || seen.current!.has(c.doc.id)) return;
          seen.current!.add(c.doc.id);
          const d = c.doc.data();
          if (d.shower === true) return;
          const type = String(d.type || "");
          const room = String(d.roomName || "");
          fresh.push({
            id: c.doc.id,
            icon: type === "gift" ? String(d.giftIcon || "🎁") : type.startsWith("friend_request") ? "🤝" : "🔔",
            text: String(d.message || d.text || "You have a new alert."),
            note: type === "gift" && d.giftMessage ? `“${String(d.giftMessage)}”` : "",
            path: type.startsWith("friend_request")
              ? "/friends"
              : (type === "game_invite" || type === "mention") && room
                ? `/room/${encodeURIComponent(room)}`
                : "/alerts",
            gift: type === "gift",
          });
        });
        if (fresh.length) setPops((p) => [...p, ...fresh].slice(-3));
      },
      () => {}
    );
  }, [username]);

  // each popup hides by itself after 6 s
  useEffect(() => {
    if (!pops.length) return;
    const t = setTimeout(() => setPops((p) => p.slice(1)), 6000);
    return () => clearTimeout(t);
  }, [pops]);

  if (!pops.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[250] flex flex-col items-center gap-2 px-3" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {pops.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            setPops((all) => all.filter((x) => x.id !== p.id));
            router.push(p.path);
          }}
          className="pointer-events-auto flex w-full max-w-[420px] animate-[alertpop_.25s_ease-out] items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-white shadow-xl"
          style={{
            background: p.gift ? "linear-gradient(135deg,#FF6FA8,#D6336C)" : "linear-gradient(135deg,#6FA8FF,#2F63D6)",
          }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-2xl">{p.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-5">{p.text}</span>
            {p.note && <span className="block truncate text-[12.5px] text-white/85">{p.note}</span>}
          </span>
          <span
            role="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              setPops((all) => all.filter((x) => x.id !== p.id));
            }}
            className="shrink-0 px-1 text-lg font-bold text-white/80"
          >
            ×
          </span>
        </button>
      ))}
      <style>{`@keyframes alertpop{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
