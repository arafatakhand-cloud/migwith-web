"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { blogAgoBn, blogCall, blogError } from "../../lib/feed";

// 🔍 Feed search: 🌍 Everyone Migs (title, text, writer, place) and people by name.

type Hit = { id: string; author: string; title: string; excerpt: string; place: string; image: string; createdMs: number; likes: number; comments: number };
type Person = { username: string; level: number; photo: string };

const FACE = ["#E2457A", "#7C4DFF", "#F59E0B", "#14A3B8", "#2563EB", "#16A34A"];
const faceOf = (name: string) => FACE[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % FACE.length];

export function FeedSearch({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"migs" | "people">("migs");
  const [posts, setPosts] = useState<Hit[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // search a moment after typing stops
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setPosts(null);
      setPeople(null);
      setErr("");
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      setBusy(true);
      setErr("");
      try {
        const r = (await blogCall("search", { q: text })) as { posts?: Hit[]; people?: Person[] };
        if (!live) return;
        setPosts(r.posts || []);
        setPeople(r.people || []);
      } catch (e) {
        if (live) setErr(blogError(e));
      } finally {
        if (live) setBusy(false);
      }
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const list = tab === "migs" ? posts : people;
  // over everything (the site's top bar too)
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#F4F4F8]" role="dialog" aria-label="Search">
      <div className="flex items-center gap-2 bg-white px-3 pb-3 pt-4 shadow-[0_6px_18px_-14px_rgba(30,27,75,.5)]">
        <button type="button" onClick={onClose} aria-label="Close search" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F9] text-[18px] font-black text-[#1E1B4B]">
          ←
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#F1F3F9] px-4 py-2.5">
          <span aria-hidden>🔍</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 40))}
            placeholder="Search Migs, people, places…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#1E1B4B] outline-none placeholder:text-[#8A8FB0]"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear" className="text-[13px] font-bold text-[#8A8FB0]">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2 px-3.5 py-3">
        {([["migs", "📰 Migs", posts?.length], ["people", "👤 People", people?.length]] as const).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-2 text-[13.5px] font-extrabold transition ${tab === k ? "bg-[#2563EB] text-white shadow-[0_8px_16px_-8px_rgba(37,99,235,.9)]" : "bg-white text-[#4B5072]"}`}
          >
            {label}
            {n != null ? ` · ${n}` : ""}
          </button>
        ))}
        {busy && <span className="self-center text-[12.5px] font-bold text-[#8A8FB0]">Searching…</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-3.5 pb-8">
        {err && <p className="py-4 text-center text-[13px] text-[#B91C1C]">{err}</p>}
        {list === null && !err && (
          <p className="py-10 text-center text-[13.5px] text-[#8A8FB0]">Type at least 2 letters — a word from a Mig, a name or a place.</p>
        )}
        {list !== null && list.length === 0 && !busy && (
          <p className="py-10 text-center text-[13.5px] text-[#8A8FB0]">Nothing found for “{q.trim()}”.</p>
        )}
        {tab === "migs" &&
          posts?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              className="mb-2.5 flex w-full items-center gap-3 rounded-[18px] bg-white p-3 text-left shadow-[0_6px_16px_-12px_rgba(30,27,75,.45)] active:scale-[.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-[#6B6F9A]">
                  {p.author} · {blogAgoBn(p.createdMs)}
                  {p.place ? ` · 📍 ${p.place}` : ""}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[14.5px] font-extrabold leading-5 text-[#1E1B4B]">{p.title || p.excerpt}</div>
                {p.excerpt && p.excerpt !== p.title && <div className="mt-0.5 line-clamp-1 text-[12.5px] text-[#6B6F9A]">{p.excerpt}</div>}
                <div className="mt-1 text-[12px] font-bold text-[#8A8FB0]">❤️ {p.likes} · 💬 {p.comments}</div>
              </div>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              )}
            </button>
          ))}
        {tab === "people" &&
          people?.map((u) => (
            <Link
              key={u.username}
              href={`/profile/${encodeURIComponent(u.username)}`}
              className="mb-2 flex items-center gap-3 rounded-[18px] bg-white p-3 shadow-[0_6px_16px_-12px_rgba(30,27,75,.45)]"
            >
              {u.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.photo} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full text-[18px] font-black text-white" style={{ background: faceOf(u.username) }}>
                  {u.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold text-[#1E1B4B]">{u.username}</div>
                {u.level > 0 && <div className="text-[12px] font-bold text-[#8A8FB0]">Level {u.level}</div>}
              </div>
              <span className="text-[13px] font-extrabold text-[#2563EB]">Profile ›</span>
            </Link>
          ))}
      </div>
    </div>,
    document.body
  );
}
