"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { StickerImg } from "../_components/StickerImg";
import { isMainFounderName } from "../../lib/founder";
import { formatStickerPrice, getStickerPack, useOwnedStickerPacks, useStickerPacks, type StickerPack } from "../../lib/stickers";

// 🎨 Sticker Store (miglife: "like the video"): All / Free / Paid / My Packs.
// Each pack shows 9 of its stickers, its name, kind and count, and Get Free /
// Buy Pack / ✓ Collection. A pack, once yours, is yours forever. Coins only
// move on the server (getStickerPack).

type Tab = "all" | "free" | "paid" | "mine";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "▦" },
  { key: "free", label: "Free", icon: "🎁" },
  { key: "paid", label: "Paid", icon: "🪙" },
  { key: "mine", label: "My Packs", icon: "👜" },
];
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export default function StickerStorePage() {
  useRequireLogin();
  const { user } = useSession();
  const { username } = useCurrentUser();
  const uid = user?.uid;
  const packs = useStickerPacks();
  const owned = useOwnedStickerPacks(uid);
  const [tab, setTab] = useState<Tab>("all");
  const [balance, setBalance] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<StickerPack | null>(null);
  const [view, setView] = useState<StickerPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => setBalance(Number(snap.get("balance") || 0)));
  }, [uid]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => {
    const list = packs || [];
    if (tab === "free") return list.filter((p) => p.price === 0);
    if (tab === "paid") return list.filter((p) => p.price > 0);
    if (tab === "mine") return list.filter((p) => owned?.has(p.id));
    return list;
  }, [packs, owned, tab]);

  const get = async (p: StickerPack) => {
    setBusy(true);
    try {
      await getStickerPack(p.id);
      setToast("✅ Sticker package activated successfully");
    } catch (e: any) {
      setToast(e?.message || "Could not get this sticker pack.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6 lg:max-w-4xl">
        <PageTitle title="Sticker Store" subtitle="Free and paid sticker packs" icon="🎨" />
        <div className="flex items-center justify-between px-1 text-sm">
          {isMainFounderName(username) ? (
            <Link href="/stickers/admin" className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1565D8] shadow-sm">
              ⚙️ Manage packs
            </Link>
          ) : (
            <span />
          )}
          <span className="rounded-full bg-[#0B2A5B] px-3 py-1 text-xs font-bold text-[#6FE0A0]">🪙 {balance === null ? "…" : short(balance)}</span>
        </div>

        {/* tabs */}
        <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[12px] font-bold ${
                tab === t.key ? "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white" : "text-[#35507E]"
              }`}
            >
              <span className="text-[16px] leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {packs === null ? (
          <p className="py-16 text-center text-sm text-[#7A8599]">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7A8599]">{tab === "mine" ? "You have no sticker packs yet." : "No sticker packs here yet."}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {shown.map((p) => {
              const isMine = !!owned?.has(p.id);
              return (
                <div key={p.id} className="overflow-hidden rounded-[18px] border border-[#E3EAF5] bg-white shadow-[0_6px_16px_rgba(40,80,160,.10)]">
                  <button type="button" onClick={() => setView(p)} className="grid w-full grid-cols-3 gap-0.5 bg-[#F6F9FE] p-2" aria-label={`See ${p.name}`}>
                    {p.stickers.slice(0, 9).map((s) => (
                      <StickerImg key={s.id || s.url} url={s.url} alt="" className="aspect-square w-full object-contain" />
                    ))}
                  </button>
                  <div className="px-2.5 pb-2.5 pt-2">
                    <p className="truncate text-[14px] font-extrabold text-[#0B2A5B]">{p.name}</p>
                    <p className="truncate text-[11px] text-[#7A8599]">
                      {p.category ? `${p.category} · ` : ""}
                      {p.stickers.length} stickers
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${p.price ? "bg-[#FFF3D1] text-[#9A6A00]" : "bg-[#E3F7EA] text-[#178A43]"}`}
                      >
                        {p.price ? `🪙 ${formatStickerPrice(p.price)}` : "Free"}
                      </span>
                      {isMine ? (
                        <span className="flex h-8 flex-1 items-center justify-center rounded-full bg-[#22C55E] text-[12px] font-extrabold text-white">✓ Collection</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || owned === null}
                          onClick={() => setConfirm(p)}
                          className={`h-8 flex-1 rounded-full text-[12px] font-extrabold text-white disabled:opacity-50 ${
                            p.price ? "bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9]" : "bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8]"
                          }`}
                        >
                          {p.price ? "🛒 Buy Pack" : "⬇ Get Free"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 📦 one pack (like the video): picture, name, kind · count, ✕ — all its
          stickers moving — price and Get / Buy / ✓ In Collection */}
      {view && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 sm:items-center" onClick={() => setView(null)}>
          <div
            className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl sm:rounded-[26px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F3F6FB] p-1">
                <StickerImg url={view.cover || view.stickers[0]?.url || ""} alt={view.name} className="h-full w-full object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-black text-[#0B2A5B]">{view.name}</p>
                <p className="truncate text-[12px] text-[#7A8599]">
                  {view.category ? `${view.category} · ` : ""}
                  {view.stickers.length} stickers
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setView(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F4F9] text-[16px] text-[#5B6478] shadow-sm"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#EEF1F6] px-3 py-3">
              <div className="grid grid-cols-5 gap-2">
                {view.stickers.map((s) => (
                  <span key={s.id || s.url} className="flex aspect-square items-center justify-center rounded-xl bg-[#F6F8FC] p-1">
                    <StickerImg url={s.url} alt="" className="h-full w-full object-contain" />
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-[#EEF1F6] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
              <span
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-black ${view.price ? "bg-[#FFF3D1] text-[#9A6A00]" : "bg-[#E3F7EA] text-[#178A43]"}`}
              >
                {view.price ? `🪙 ${formatStickerPrice(view.price)}` : "Free"}
              </span>
              <span className="flex-1" />
              {owned?.has(view.id) ? (
                <span className="flex h-10 items-center rounded-full bg-[#22C55E] px-5 text-[13px] font-extrabold text-white">✓ In Collection</span>
              ) : (
                <button
                  type="button"
                  disabled={busy || owned === null}
                  onClick={() => setConfirm(view)}
                  className={`h-10 rounded-full px-5 text-[13px] font-extrabold text-white disabled:opacity-50 ${
                    view.price ? "bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9]" : "bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8]"
                  }`}
                >
                  {view.price ? "🛒 Buy Pack" : "⬇ Get Free"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Claim / Buy */}
      {confirm && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-6" onClick={() => !busy && setConfirm(null)}>
          <div className="w-full max-w-[320px] rounded-[22px] bg-white p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[44px] leading-none">{confirm.price ? "🛒" : "🎁"}</div>
            <p className="mt-2 text-[17px] font-black text-[#0B2A5B]">{confirm.price ? "Buy Sticker Pack" : "Claim Free Sticker Pack"}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[#6B778C]">
              {confirm.price
                ? `Buy "${confirm.name}" for ${confirm.price.toLocaleString("en-US")} coins? It's yours forever.`
                : "Do you want to add this free sticker pack to your collection?"}
            </p>
            <div className="mt-4 flex gap-2.5">
              <button type="button" disabled={busy} onClick={() => get(confirm)} className="h-11 flex-1 rounded-xl bg-[#132F4C] text-[14px] font-bold text-white disabled:opacity-60">
                {busy ? "…" : "Yes"}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-xl bg-[#E53935] text-[14px] font-bold text-white disabled:opacity-60">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
          <p className="rounded-full bg-[#0B1F3A]/90 px-4 py-2 text-[13px] font-semibold text-white shadow-lg">{toast}</p>
        </div>
      )}
    </PageShell>
  );
}
