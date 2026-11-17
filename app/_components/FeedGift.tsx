"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { awardUserXp } from "../../lib/xp";
import { blogCall, blogError, blogShort, type BlogPost } from "../../lib/feed";
import { loadGiftCatalog, type Gift } from "./GiftPanel";
import { GiftImg } from "./GiftImg";

// 🎁 Gifts on a Feed post (miglife Nov 2026): the same gifts and prices as in a
// room (sendGift with a postId); the post keeps a 🎁 count, the last 3 givers and
// each giver's total for 🏆 Top Gifters. Not on your own post.

const sendPostGift = httpsCallable<{ target: string; giftName: string; message: string; postId: string }, { giftIcon?: string; giftName?: string }>(functions, "sendGift");

let catalogCache: Gift[] | null = null;

export function PostGiftSheet({ post, uid, onClose, onSent }: { post: BlogPost; uid: string; onClose: () => void; onSent: (icon: string, coins: number) => void }) {
  const [gifts, setGifts] = useState<Gift[]>(catalogCache || []);
  const [balance, setBalance] = useState<number | null>(null);
  const [sel, setSel] = useState<Gift | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!catalogCache) loadGiftCatalog().then((g) => ((catalogCache = g), setGifts(g))).catch(() => setErr("Couldn't load the gifts."));
  }, []);
  useEffect(() => onSnapshot(doc(db, "users", uid), (s) => setBalance(Number(s.get("balance") || 0)), () => {}), [uid]);

  const send = async () => {
    if (!sel) return;
    if (balance !== null && balance < sel.price) return setErr(`Not enough coins for ${sel.name}.`);
    setBusy(true);
    setErr("");
    try {
      const r = await sendPostGift({ target: post.author, giftName: sel.name, message: msg.trim().slice(0, 200), postId: post.id });
      awardUserXp(uid, 5, "gift", 30_000);
      onSent(r.data?.giftIcon || sel.icon, sel.price);
      onClose();
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(10,30,60,.45)] sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-[22px] bg-white p-4 pb-safe shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <b className="text-[16px] text-[#0B2A5B]" data-notranslate>🎁 Gift for {post.author}</b>
          <span className="text-[12.5px] font-bold text-[#B8860B]">🪙 {balance === null ? "…" : balance.toLocaleString()}</span>
        </div>
        {/* 💰 the writer gets half of the gift's price (the server's POST_GIFT_SHARE_PCT) */}
        <p className="mt-1 text-[12px] font-semibold text-[#0E7A62]" data-notranslate>
          💰 {post.author} gets 50%{sel ? ` · 🪙 ${Math.floor(sel.price / 2).toLocaleString()}` : ""}
        </p>
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-4 gap-2 overflow-y-auto pr-0.5">
          {gifts.length === 0 && !err && <p className="col-span-full py-6 text-center text-sm text-[#6B819C]">Loading gifts…</p>}
          {gifts.map((g) => {
            const on = sel?.name === g.name;
            const poor = balance !== null && balance < g.price;
            return (
              <button
                key={g.name}
                type="button"
                onClick={() => setSel(g)}
                className={`flex flex-col items-center rounded-2xl border-2 px-1 py-2 text-center transition active:translate-y-[2px] ${on ? "border-[#F5A300] bg-[#FFF8E1]" : "border-transparent bg-[#F6F9FD]"} ${poor ? "opacity-45" : ""}`}
              >
                {g.imageUrl ? (
                  <GiftImg src={g.imageUrl} alt={g.name} fallback={<span className="text-[28px] leading-9">{g.icon}</span>} className="h-9 w-9 object-contain" />
                ) : (
                  <span className="text-[28px] leading-9">{g.icon}</span>
                )}
                <span className="mt-0.5 w-full truncate text-[11px] font-semibold text-[#0B2A5B]">{g.name}</span>
                <span className="text-[11px] font-bold text-[#B8860B]">🪙 {blogShort(g.price)}</span>
              </button>
            );
          })}
        </div>
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          maxLength={200}
          placeholder="✍️ A short message (optional)"
          className="mt-3 w-full rounded-xl border border-[#E3EAF3] bg-[#F7FAFD] px-3 py-2.5 text-[14px] text-[#0B2A5B] outline-none focus:border-[#F5A300]"
        />
        {err && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</p>}
        <button
          type="button"
          disabled={!sel || busy}
          onClick={send}
          className="mt-3 h-11 w-full rounded-[22px] bg-gradient-to-b from-[#FFC94D] to-[#F5A300] text-[15px] font-extrabold text-[#5A3A00] shadow-[0_3px_0_#B97A00] transition active:translate-y-[2px] active:shadow-[0_1px_0_#B97A00] disabled:opacity-50"
        >
          {busy ? "Sending…" : sel ? `${sel.icon} Send · 🪙 ${sel.price.toLocaleString()}` : "Pick a gift"}
        </button>
      </div>
    </div>
  );
}

/** 🎁 14 gifts · Nila, Tania and 8 others — tap: who gave what */
export function PostGiftBar({ p, onOpen }: { p: BlogPost; onOpen: () => void }) {
  // a gift arriving while you look: its icon floats up once
  const [fly, setFly] = useState(0);
  const before = useRef(p.gifts);
  useEffect(() => {
    if (p.gifts > before.current) setFly(Date.now());
    before.current = p.gifts;
  }, [p.gifts]);
  if (p.gifts <= 0) return null;
  const names = p.giftBy.slice(0, 2);
  const others = Math.max(0, p.gifts - names.length);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="relative mx-3 mt-2.5 flex w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-xl border border-[#F3DB95] bg-gradient-to-r from-[#FFF8E1] to-[#FFFDF5] px-2.5 py-1.5 text-left text-[12.5px] font-bold text-[#7A5600]"
    >
      {fly > 0 && (
        <span key={fly} className="feed-fly pointer-events-none absolute -top-2 right-6 text-[26px]">
          {p.giftLast || "🎁"}
        </span>
      )}
      <span className="shrink-0">{p.giftLast || "🎁"} {blogShort(p.gifts)} gift{p.gifts === 1 ? "" : "s"}</span>
      {names.length > 0 && (
        <span className="min-w-0 truncate font-semibold text-[#8A6A1A]" data-notranslate>
          · {names.join(", ")}
          {others > 0 && p.gifts > names.length ? ` and more` : ""}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[11px] text-[#B8860B]">🏆 ›</span>
    </button>
  );
}

/** 🏆 who gave gifts on this post (most coins first) */
export function PostGiversSheet({ post, onClose, onProfile }: { post: BlogPost; onClose: () => void; onProfile: (name: string) => void }) {
  const [list, setList] = useState<{ username: string; coins: number; count: number; icon: string }[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    blogCall("postGifts", { postId: post.id })
      .then((r) => setList((r.givers as { username: string; coins: number; count: number; icon: string }[]) || []))
      .catch((e) => (setErr(blogError(e)), setList([])));
  }, [post.id]);
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(10,30,60,.45)] sm:items-center" onClick={onClose}>
      <div className="flex max-h-[80dvh] w-full max-w-lg flex-col rounded-t-[22px] bg-white p-4 pb-safe shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <b className="text-[16px] text-[#0B2A5B]">🏆 Top Gifters · {blogShort(post.gifts)} gift{post.gifts === 1 ? "" : "s"}</b>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {list === null && <p className="py-6 text-center text-sm text-[#6B819C]">Loading…</p>}
          {err && <p className="py-3 text-center text-sm text-rose-600">{err}</p>}
          {list?.length === 0 && !err && <p className="py-6 text-center text-sm text-[#6B819C]">No gifts yet.</p>}
          {(list || []).map((g, i) => (
            <button key={g.username} type="button" onClick={() => onProfile(g.username)} className="flex w-full items-center gap-3 border-b border-[#EEF3F8] py-2.5 text-left last:border-0">
              <span className="w-7 text-center text-[18px]">{medal[i] || <span className="text-[13px] font-bold text-[#8A8FB0]">{i + 1}</span>}</span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-[#0B2A5B]" data-notranslate>{g.username}</span>
              <span className="text-[12.5px] text-[#6B819C]">{g.icon} ×{g.count}</span>
              <span className="w-20 text-right text-[13px] font-bold text-[#B8860B]">🪙 {blogShort(g.coins)}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 h-10 rounded-xl bg-[#F1F5FB] text-[14px] font-bold text-[#4A6280]">Close</button>
      </div>
    </div>
  );
}
