"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// ✏️ SHOP EDIT (the app's ShopEdit.kt) — miglife renames / re-prices Style
// Studio colors and Entry Effects right in the shop. Stored in
// app_settings/shop_overrides (written only by the founderEditShopItem
// function; everyone signed in can read it), shown on top of the built-in
// catalogs. The server charges the edited price too.

// prev = the value BEFORE the last change (the last history entry): what ↺ Reset goes back to.
type Override = { name: string | null; price: number | null; prev: { name: string; price: number } | null };
export type ShopOverrides = { colors: Record<string, Override>; entryFx: Record<string, Override> };

function parse(raw: unknown): Record<string, Override> {
  const out: Record<string, Override> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const m = v as { name?: unknown; price?: unknown };
    const name = typeof m.name === "string" && m.name.trim() ? m.name.trim() : null;
    const price = typeof m.price === "number" && m.price > 0 ? Math.trunc(m.price) : null;
    const history = Array.isArray((m as { history?: unknown }).history) ? ((m as { history: unknown[] }).history) : [];
    const last = history[history.length - 1] as { name?: unknown; price?: unknown } | undefined;
    const prev = last && typeof last.name === "string" && typeof last.price === "number" ? { name: last.name, price: last.price } : null;
    out[id] = { name, price, prev };
  }
  return out;
}

/** Live shop_overrides while a shop page is open. */
export function useShopOverrides(enabled = true): ShopOverrides {
  const [ov, setOv] = useState<ShopOverrides>({ colors: {}, entryFx: {} });
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "app_settings", "shop_overrides"),
      (snap) => setOv({ colors: parse(snap.get("colors")), entryFx: parse(snap.get("entryFx")) }),
      () => {}
    );
  }, [enabled]);
  return ov;
}

export const shopName = (map: Record<string, Override>, id: string, fallback: string) => map[id]?.name ?? fallback;
export const shopPrice = (map: Record<string, Override>, id: string, fallback: number) => map[id]?.price ?? fallback;
export const shopPrev = (map: Record<string, Override>, id: string) => map[id]?.prev ?? null;

const founderEditShopItem = httpsCallable<
  { kind: "color" | "fx"; id: string; name?: string; price?: number; currentName?: string; reset?: boolean },
  { ok?: boolean }
>(functions, "founderEditShopItem");

/** miglife's edit dialog: name + price. Save keeps the old value; ↺ Reset goes
 *  back to the value before the last change (one step per tap). */
export function ShopItemEditDialog({
  kind,
  id,
  title,
  currentName,
  currentPrice,
  previous,
  onDone,
  onDismiss,
}: {
  kind: "color" | "fx";
  id: string;
  title: string;
  currentName: string;
  currentPrice: number;
  /** What ↺ Reset restores (null = nothing saved yet). */
  previous: { name: string; price: number } | null;
  onDone: (message: string) => void;
  onDismiss: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [price, setPrice] = useState(String(currentPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (payload: Parameters<typeof founderEditShopItem>[0], ok: string) => {
    setBusy(true);
    setError(null);
    try {
      await founderEditShopItem(payload);
      onDone(ok);
      onDismiss();
    } catch (e: any) {
      setError(e?.message || "Could not save.");
      setBusy(false);
    }
  };
  const save = () => {
    const p = Number(price);
    if (!name.trim()) return setError("Enter a name.");
    if (!Number.isInteger(p) || p < 1000 || p > 100_000_000) return setError("Price: 1,000 – 100,000,000.");
    // currentName: the server keeps it as the value Reset goes back to.
    void call({ kind, id, name: name.trim(), price: p, currentName }, `✓ Saved: ${name.trim()} · ${p.toLocaleString("en-US")} coins`);
  };

  const field = "w-full rounded-xl border border-[#C9D6E8] bg-white px-3 py-2.5 text-sm text-[#0B2A5B] outline-none focus:border-[#2F80ED]";
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-6" onClick={() => !busy && onDismiss()}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-[#1b1b1f]" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-bold">✏️ Edit {title}</p>
        <label className="mt-3 block text-xs font-bold text-[#5B6B8C]">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} className={`mt-1 ${field}`} />
        <label className="mt-2 block text-xs font-bold text-[#5B6B8C]">Price (coins)</label>
        <input
          value={price}
          inputMode="numeric"
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))}
          className={`mt-1 ${field}`}
        />
        <p className="mt-1.5 text-[11px] text-[#8A97A8]">
          {previous
            ? `↺ Reset goes back to: ${previous.name} · ${previous.price.toLocaleString("en-US")} coins`
            : "No earlier name/price saved yet."}
        </p>
        {error && <p className="mt-1 text-xs font-bold text-[#E5484D]">{error}</p>}
        <div className="mt-3 flex items-center justify-between text-sm font-bold">
          <button
            type="button"
            disabled={busy || !previous}
            onClick={() =>
              previous && void call({ kind, id, reset: true }, `↺ Back to ${previous.name} · ${previous.price.toLocaleString("en-US")} coins`)
            }
            className="text-[#E5484D] disabled:text-[#B0B8C4]"
          >
            ↺ Reset
          </button>
          <button type="button" disabled={busy} onClick={save} className="text-[#6750A4] disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
