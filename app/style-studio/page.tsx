"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";
import { ShopItemEditDialog, shopName, shopPrev, shopPrice, useShopOverrides } from "../_components/ShopEdit";
import { isMainFounderName } from "../../lib/founder";
import { useCurrentUser } from "../../lib/useCurrentUser";

// Explore › Style Studio: premium username colors, same catalog and Cloud
// Functions as the app (requestColorPurchase → approved by migwith,
// toggleOwnedColor). Coins are only ever moved by the server.

type ShopColor = {
  id: string;
  name: string;
  color: string;
  badge: string;
  price: number;
  days: number;
  bold: boolean;
  voice: boolean;
  description: string;
};

// COLOR_SHOP_CATALOG in the app.
const CATALOG: ShopColor[] = [
  { id: "king", name: "Emperor", color: "#12AFC7", badge: "👑", price: 400000, days: 30, bold: true, voice: true, description: "" },
  { id: "queen", name: "Angel", color: "#E91E8C", badge: "👼", price: 300000, days: 30, bold: true, voice: true, description: "" },
  { id: "mafia", name: "Don", color: "#8B5A5A", badge: "🎩", price: 250000, days: 30, bold: false, voice: false, description: "" },
  { id: "vip", name: "Star", color: "#00A383", badge: "⭐", price: 300000, days: 40, bold: true, voice: true, description: "Emerald username + [STAR] badge" },
  { id: "diamond", name: "Platinum", color: "#12AFC7", badge: "💎", price: 200000, days: 30, bold: false, voice: true, description: "Cyan username + [PLATINUM] badge" },
  { id: "premium", name: "Royal", color: "#8BC34A", badge: "🏵️", price: 150000, days: 30, bold: true, voice: true, description: "Deep pink username + [ROYAL] badge" },
  { id: "supporter", name: "Patron", color: "#29B6F6", badge: "🛡️", price: 100000, days: 30, bold: false, voice: true, description: "Pink username + [PATRON] badge" },
  { id: "streamer", name: "Icon", color: "#C2185B", badge: "🎬", price: 100000, days: 30, bold: false, voice: true, description: "Raspberry username + [ICON] badge" },
];

type Owned = Record<string, { expiresAt?: number; active?: boolean }>;

const requestColorPurchase = httpsCallable<{ colorId: string }, unknown>(functions, "requestColorPurchase");
const toggleOwnedColor = httpsCallable<{ colorId: string; active: boolean }, unknown>(functions, "toggleOwnedColor");

const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function StyleStudioPage() {
  const ready = useRequireLogin();
  const { user } = useSession();
  const uid = user?.uid;
  const [balance, setBalance] = useState<number | null>(null);
  const [owned, setOwned] = useState<Owned>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null); // 🏆 the style whose sheet is open
  // ✏️ miglife renames / re-prices colors (app_settings/shop_overrides)
  const { username } = useCurrentUser();
  const isFounder = isMainFounderName(username);
  const ov = useShopOverrides(!!uid);
  const [editing, setEditing] = useState<ShopColor | null>(null);
  const nameOf = (c: ShopColor) => shopName(ov.colors, c.id, c.name);
  const priceOf = (c: ShopColor) => shopPrice(ov.colors, c.id, c.price);

  useEffect(() => {
    if (!uid) return;
    const offUser = onSnapshot(doc(db, "users", uid), (snap) => {
      setBalance(Number(snap.get("balance") || 0));
      const o = snap.get("ownedColors");
      setOwned(o && typeof o === "object" ? (o as Owned) : {});
    });
    const offPending = onSnapshot(
      query(collection(db, "color_purchase_requests"), where("uid", "==", uid), where("status", "==", "pending")),
      (snap) => setPending(new Set(snap.docs.map((d) => String(d.get("colorId") || "")))),
      () => {}
    );
    return () => {
      offUser();
      offPending();
    };
  }, [uid]);

  const now = Date.now();
  const mine = CATALOG.filter((c) => Number(owned[c.id]?.expiresAt || 0) > now);
  const available = CATALOG.filter((c) => !mine.includes(c));

  const buy = async (c: ShopColor) => {
    setConfirmId(null);
    setBusy(c.id);
    setMessage("");
    try {
      await requestColorPurchase({ colorId: c.id });
      setMessage("Purchase requested — waiting for admin approval.");
    } catch (e: any) {
      setMessage(e?.message || "Could not request that color.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (c: ShopColor, active: boolean) => {
    setBusy(c.id);
    setMessage("");
    try {
      await toggleOwnedColor({ colorId: c.id, active });
    } catch (e: any) {
      setMessage(e?.message || "Could not update that color.");
    } finally {
      setBusy(null);
    }
  };

  const confirming = CATALOG.find((c) => c.id === confirmId);
  const sheet = CATALOG.find((c) => c.id === sheetId);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-10 sm:px-6">
        <PageTitle title="Style Studio" subtitle="Premium username colors" icon="🎨" />
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="font-semibold text-[#35507E]">Available colors · {CATALOG.length} styles</span>
          <span className="rounded-full bg-[#0B2A5B] px-3 py-1 text-xs font-bold text-[#6FE0A0]">
            🪙 {balance === null ? "…" : short(balance)}
          </span>
        </div>
        {message && <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{message}</p>}

        {mine.length > 0 && (
          <div className="mt-3 rounded-2xl border border-[#F5D77A] bg-[#FFF8E1] p-3">
            <p className="text-sm font-bold text-[#7A5B00]">🏅 My Color</p>
            <p className="text-[11px] text-[#8A8060]">You can have one color at a time. When OFF, your role color (mod/user) shows.</p>
            <ul className="mt-2 space-y-2">
              {mine.map((c) => {
                const on = owned[c.id]?.active === true;
                const days = Math.ceil((Number(owned[c.id]?.expiresAt || 0) - now) / 86_400_000);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border bg-white p-2.5" style={{ borderColor: `${c.color}66` }}>
                    <span className="text-xl">{c.badge}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold" style={{ color: c.color }}>
                        {nameOf(c)}
                      </span>
                      {on && <span className="ml-1.5 rounded-md bg-[#FFE1DE] px-1.5 text-[10px] font-bold text-[#B3261E]">ACTIVE</span>}
                      <span className="block text-[11px] text-[#8A8060]">{days} days left</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      disabled={busy === c.id}
                      onClick={() => toggle(c, !on)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-[#174EA6]" : "bg-[#C5D0E0]"}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 🏆 G · Ranked list: every style by price; tap one → the sheet with its preview and Buy */}
        <SectionLabel>🏆 Ranked by price</SectionLabel>
        {/* B1 · White Keycap: white rows standing on three layers of the style's own colour */}
        <ul className="space-y-3.5 pb-2">
          {[...available]
            .sort((x, y) => priceOf(y) - priceOf(x))
            .map((c, i) => {
              const isPending = pending.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSheetId(c.id)}
                    className="flex w-full items-center gap-3 rounded-[18px] py-2.5 pl-3 pr-3 text-left transition active:translate-y-[3px]"
                    style={{
                      background: "linear-gradient(180deg,#FFFFFF,#F3F7FC)",
                      boxShadow: `inset 0 2px 0 #fff, 0 3px 0 ${c.color}55, 0 6px 0 ${c.color}40, 0 9px 0 ${c.color}2a, 0 14px 16px -6px ${c.color}66`,
                    }}
                  >
                    <span className="w-4 text-center text-[13px] font-black text-[#B5C0D0]">{i + 1}</span>
                    <span
                      className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-[18px]"
                      style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${c.color}55)`, border: `2px solid ${c.color}` }}
                    >
                      {c.badge}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px]" style={{ color: c.color, fontWeight: 900 }}>
                        {nameOf(c)}
                      </span>
                      <span className="block text-[11.5px] text-[#7A8AA3]">
                        {c.days} days{c.bold ? " · Bold" : ""}
                        {isPending ? " · ⏳ waiting" : ""}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-extrabold text-[#8A6A00]"
                      style={{ background: "linear-gradient(180deg,#FFF6D6,#FFE7A0)", boxShadow: "0 3px 0 #D9A92A" }}
                    >
                      🪙 {priceOf(c).toLocaleString()}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
        <p className="mt-4 text-center text-[11px] text-[#8A97A8]">Admin approval is needed when you buy a color.</p>
      </section>

      {sheet && (() => {
        const c = sheet;
        const isPending = pending.has(c.id);
        const price = priceOf(c);
        const canAfford = balance !== null && balance >= price;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-3" onClick={() => setSheetId(null)}>
            <div className="w-full max-w-md rounded-t-[26px] bg-white px-4 pb-5 pt-2.5 shadow-2xl pb-safe sm:rounded-[26px]" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-[#D4DDEB]" />
              <div className="flex items-center gap-3">
                <span className="text-[34px]">{c.badge}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[22px]" style={{ color: c.color, fontWeight: 900 }}>
                    {nameOf(c)}
                  </span>
                  <span className="block text-[12px] text-[#8A97A8]">
                    {c.days} days{c.bold ? " · Bold name" : ""}
                  </span>
                </span>
                {isFounder && (
                  <button type="button" onClick={() => (setSheetId(null), setEditing(c))} aria-label="Edit" className="rounded-lg px-1 text-[16px]">
                    ✏️
                  </button>
                )}
                <button type="button" onClick={() => setSheetId(null)} aria-label="Close" className="px-1 text-[#8494B2]">
                  ✕
                </button>
              </div>
              {/* your own name, in this colour, the way the room will show it */}
              <div className="mt-3 rounded-2xl bg-[#F4F7FB] px-3.5 py-3 text-[14px]">
                <span style={{ color: c.color, fontWeight: c.bold ? 800 : 600 }}>{username || "you"}</span>
                <span className="text-[#1E2A3B]">: Hey everyone! 👋</span>
              </div>
              {c.description && <p className="mt-2 text-[12px] text-[#5B6B8C]">{c.description}</p>}
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px]">
                <span className="rounded-full bg-[#FFF3E0] px-2.5 py-1 text-[#B26A00]">🖼 Photos</span>
                {c.voice ? (
                  <span className="rounded-full bg-[#E3F5E6] px-2.5 py-1 text-[#2E7D32]">🎤 Voice</span>
                ) : (
                  <span className="rounded-full bg-[#EDEDED] px-2.5 py-1 text-[#999]">🚫 No voice</span>
                )}
                <span className="rounded-full bg-[#EAF2FC] px-2.5 py-1 text-[#35507E]">🏷 Badge</span>
                <span className="rounded-full bg-[#EDEAFB] px-2.5 py-1 text-[#5B4FC7]">🎬 Video soon</span>
              </div>
              <button
                type="button"
                disabled={!ready || !canAfford || isPending || busy === c.id}
                onClick={() => (setSheetId(null), setConfirmId(c.id))}
                className="mt-4 w-full rounded-2xl py-3.5 text-[15px] font-black text-white disabled:opacity-50"
                style={{ background: c.color }}
              >
                {busy === c.id
                  ? "Requesting…"
                  : isPending
                    ? "⏳ Waiting for approval"
                    : canAfford
                      ? `Buy · 🪙 ${price.toLocaleString()}`
                      : `Not enough coins · 🪙 ${price.toLocaleString()}`}
              </button>
            </div>
          </div>
        );
      })()}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center" onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">
              {confirming.badge} Buy {nameOf(confirming)}?
            </h2>
            <p className="text-sm text-[#5B6B8C]">
              🪙 {priceOf(confirming).toLocaleString()} for {confirming.days} days. The coins are held now, and the color is yours once an admin approves the request.
            </p>
            {mine.filter((m) => m.id !== confirming.id).map((m) => {
              const left = Math.max(1, Math.ceil((Number(owned[m.id]?.expiresAt || 0) - now) / 86400000));
              return (
                <p key={m.id} className="rounded-xl bg-[#FFF1E6] px-3 py-2 text-[13px] font-semibold text-[#B45309]">
                  ⚠️ You can have only one color. Your {m.badge} {nameOf(m)} ({left} {left === 1 ? "day" : "days"} left) will be removed — the days left are not refunded.
                </p>
              );
            })}
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmId(null)} className="flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]">
                Cancel
              </button>
              <button type="button" onClick={() => buy(confirming)} className="flex-1 rounded-xl bg-[#2F80ED] py-3 text-sm font-black text-white">
                Request
              </button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <ShopItemEditDialog
          kind="color"
          id={editing.id}
          title={nameOf(editing)}
          currentName={nameOf(editing)}
          currentPrice={priceOf(editing)}
          previous={shopPrev(ov.colors, editing.id)}
          onDone={setMessage}
          onDismiss={() => setEditing(null)}
        />
      )}
    </PageShell>
  );
}
