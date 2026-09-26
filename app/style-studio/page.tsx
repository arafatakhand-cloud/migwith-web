"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import { PageTitle, SectionLabel } from "../_components/LightCards";

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
  { id: "vip", name: "Star", color: "#E5395C", badge: "⭐", price: 300000, days: 40, bold: true, voice: true, description: "Gold username + [STAR] badge" },
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

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
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
            <p className="text-sm font-bold text-[#7A5B00]">🏅 My Owned Colors</p>
            <p className="text-[11px] text-[#8A8060]">Toggle each color on/off. When OFF, your role color (mod/user) shows.</p>
            <ul className="mt-2 space-y-2">
              {mine.map((c) => {
                const on = owned[c.id]?.active === true;
                const days = Math.ceil((Number(owned[c.id]?.expiresAt || 0) - now) / 86_400_000);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border bg-white p-2.5" style={{ borderColor: `${c.color}66` }}>
                    <span className="text-xl">{c.badge}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold" style={{ color: c.color }}>
                        {c.name}
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

        <SectionLabel>Shop</SectionLabel>
        <div className="space-y-3">
          {available.map((c) => {
            const isPending = pending.has(c.id);
            const canAfford = balance !== null && balance >= c.price;
            return (
              <div key={c.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg" style={{ color: c.color, fontWeight: c.bold ? 900 : 700 }}>
                    {c.name}
                  </span>
                  <span>{c.badge}</span>
                  <span className="ml-auto rounded-full border border-[#F5D77A] bg-[#FFF8E1] px-2.5 py-0.5 text-xs font-bold text-[#8A5A00]">
                    🪙 {c.price.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-1.5 text-[11px]">
                  <span className="rounded-md bg-[#EAF2FC] px-2 py-0.5 text-[#35507E]">{c.days} days</span>
                  {c.bold && <span className="rounded-md bg-[#EAF2FC] px-2 py-0.5 font-bold text-[#35507E]">BOLD</span>}
                </div>
                <div className="mt-2 rounded-xl bg-[#F4F7FB] px-3 py-2 text-sm">
                  <span className="text-[10px] text-[#999]">Preview </span>
                  <span style={{ color: c.color, fontWeight: c.bold ? 800 : 600 }}>you:</span>{" "}
                  <span className="text-[#222]">Hey everyone! 👋</span>
                </div>
                {c.description && <p className="mt-1.5 text-[11px] text-[#666]">{c.description}</p>}
                <p className="mt-2 text-[10px] font-bold tracking-widest text-[#999]">WHAT YOU GET</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-lg bg-[#FFF3E0] px-2 py-0.5 text-[#B26A00]">🖼 Images</span>
                  {c.voice ? (
                    <span className="rounded-lg bg-[#E3F5E6] px-2 py-0.5 text-[#2E7D32]">🎙 Voice</span>
                  ) : (
                    <span className="rounded-lg bg-[#EDEDED] px-2 py-0.5 text-[#999]">🚫 No voice</span>
                  )}
                  <span className="rounded-lg bg-[#EDEAFB] px-2 py-0.5 text-[#5B4FC7]">🎬 Video soon</span>
                </div>
                <button
                  type="button"
                  disabled={!ready || !canAfford || isPending || busy === c.id}
                  onClick={() => setConfirmId(c.id)}
                  className={`mt-3 w-full rounded-xl border py-2.5 text-sm font-bold ${
                    canAfford && !isPending ? "border-[#43B65A] bg-[#EFFCEF] text-[#1E7A34]" : "border-[#DDD] bg-white text-[#999]"
                  }`}
                >
                  {busy === c.id
                    ? "Requesting…"
                    : isPending
                      ? "⏳ Waiting for approval"
                      : canAfford
                        ? `Buy for 🪙 ${c.price.toLocaleString()}`
                        : "Not enough coins"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center" onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">
              {confirming.badge} Buy {confirming.name}?
            </h2>
            <p className="text-sm text-[#5B6B8C]">
              🪙 {confirming.price.toLocaleString()} for {confirming.days} days. The coins are held now, and the color is yours once an admin approves the request.
            </p>
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
    </PageShell>
  );
}
