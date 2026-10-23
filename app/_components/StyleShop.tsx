"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 🎨 Game style shops (Luxury box, Cricket box, Teen Patti / 29 / Ludo
// tables and cards). Like the app: one style of each kind is free, the rest
// are bought with coins through the game's buy… Cloud Function and saved to
// the buyer's account ({game}_inventory/{uid}). Only the functions write the
// inventory; the page just reads it. The style is what YOU see.

export type ShopKind = {
  /** field in the inventory doc that holds the chosen id, e.g. "box" */
  kind: string;
  /** field that lists the owned ids, e.g. "ownedBoxes" */
  ownedField: string;
  /** the free style */
  free: string;
};

/** lb_inventory/{uid}: Luxury Bot box colour + Cricket box style. */
export const LB_KINDS: ShopKind[] = [
  { kind: "box", ownedField: "ownedBoxes", free: "royal" },
  { kind: "cricket", ownedField: "ownedCricket", free: "classic" },
];

export type Inventory = {
  active: Record<string, string>;
  owned: Record<string, Set<string>>;
  setActive: (kind: string, id: string) => void;
  addOwned: (kind: string, id: string) => void;
};

/** Live inventory from `{collection}/{uid}`, with the app's "free one is always owned". */
export function useInventory(collection: string, uid: string | undefined, kinds: ShopKind[]): Inventory {
  const key = kinds.map((k) => `${k.kind}:${k.ownedField}:${k.free}`).join("|");
  const init = () => {
    const active: Record<string, string> = {};
    const owned: Record<string, Set<string>> = {};
    kinds.forEach((k) => {
      active[k.kind] = k.free;
      owned[k.kind] = new Set([k.free]);
    });
    return { active, owned };
  };
  const [inv, setInv] = useState(init);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, collection, uid),
      (snap) => {
        const data = snap.data() || {};
        const active: Record<string, string> = {};
        const owned: Record<string, Set<string>> = {};
        kinds.forEach((k) => {
          const list = Array.isArray(data[k.ownedField]) ? (data[k.ownedField] as unknown[]) : [];
          const set = new Set<string>([k.free, ...list.filter((x): x is string => typeof x === "string")]);
          owned[k.kind] = set;
          const pick = typeof data[k.kind] === "string" ? (data[k.kind] as string) : "";
          active[k.kind] = set.has(pick) ? pick : k.free;
        });
        setInv({ active, owned });
      },
      () => {}
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, uid, key]);

  return {
    ...inv,
    setActive: (kind, id) => setInv((s) => ({ ...s, active: { ...s.active, [kind]: id } })),
    addOwned: (kind, id) =>
      setInv((s) => ({ ...s, owned: { ...s.owned, [kind]: new Set([...(s.owned[kind] || []), id]) } })),
  };
}

export type ShopItem = { id: string; name: string; emoji?: string; price: number };

export type ShopTab<T extends ShopItem> = {
  label: string;
  kind: string;
  items: T[];
  perRow?: number;
  /** "bet box colour", "table", … used in the buy question */
  noun: string;
  preview: (item: T) => ReactNode;
};

export type ShopTheme = {
  bg: string;
  border: string;
  title: string;
  sub: string;
  /** background of the selected tab / IN USE pill (may be a gradient) */
  accent: string;
  accentInk: string;
};

function opId(prefix: string): string {
  return `${prefix}_buy_` + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

/** The shop dialog: tabs (when more than one kind), preview cards, buy confirm. */
export function StyleShopDialog({
  title,
  subtitle,
  theme,
  tabs,
  inv,
  buyFn,
  setFn,
  opPrefix,
  onClose,
}: {
  title: string;
  subtitle: string;
  theme: ShopTheme;
  tabs: ShopTab<any>[];
  inv: Inventory;
  buyFn: string;
  setFn: string;
  opPrefix: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ShopItem | null>(null);
  const t = tabs[tab];
  const perRow = t.perRow || 2;

  const use = async (item: ShopItem) => {
    setBusy(item.id);
    inv.setActive(t.kind, item.id); // show it at once
    try {
      await httpsCallable(functions, setFn)({ [t.kind]: item.id });
    } catch (e: any) {
      setMessage(e?.message || "Could not change style.");
    } finally {
      setBusy(null);
    }
  };

  const buy = async (item: ShopItem) => {
    setBusy(item.id);
    try {
      await httpsCallable(functions, buyFn)({ kind: t.kind, id: item.id, operationId: opId(opPrefix) });
      inv.addOwned(t.kind, item.id);
      inv.setActive(t.kind, item.id);
      setMessage(`${item.emoji ? item.emoji + " " : ""}${item.name} is yours!`);
    } catch (e: any) {
      setMessage(e?.message || "Purchase failed.");
    } finally {
      setBusy(null);
    }
  };

  // FIX (no way to close it on a phone): the shop used to be drawn INSIDE the
  // game box, which trapped it there — its top (title + ✕) was cut off under
  // the top bar. It now opens over the whole page (a portal on <body>), sized
  // to the screen you can really see (dvh), with a big ✕ and a Close button.
  const [portalOk, setPortalOk] = useState(false);
  useEffect(() => setPortalOk(true), []);
  if (!portalOk) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-[22px] p-3.5"
        style={{ background: theme.bg, border: `1.5px solid ${theme.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start">
          <div className="flex-1">
            <div className="text-lg font-black" style={{ color: theme.title }}>
              {title}
            </div>
            <div className="text-[11px]" style={{ color: theme.sub }}>
              {subtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white"
          >
            ✕
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="mt-2.5 flex rounded-full bg-white/[0.13] p-0.5">
            {tabs.map((x, i) => (
              <button
                key={x.kind}
                type="button"
                onClick={() => setTab(i)}
                className="flex-1 rounded-full py-1.5 text-[13px] font-bold"
                style={tab === i ? { background: theme.accent, color: theme.accentInk } : { color: "#fff" }}
              >
                {x.label}
              </button>
            ))}
          </div>
        )}

        {message && <div className="mt-2 text-xs font-bold text-[#FFD27A]">{message}</div>}

        <div className="mt-2.5 grid flex-1 gap-2.5 overflow-y-auto pb-1" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
          {t.items.map((item) => {
            const owned = item.price === 0 || inv.owned[t.kind]?.has(item.id);
            const active = inv.active[t.kind] === item.id;
            const label = busy === item.id ? "…" : active ? "✓ IN USE" : owned ? "USE" : `🪙 ${item.price.toLocaleString()}`;
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy !== null}
                onClick={() => (owned ? !active && use(item) : setConfirm(item))}
                className="flex min-w-0 flex-col items-center rounded-2xl p-1.5 text-center transition active:scale-[.97]"
                style={{
                  background: active ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)",
                  border: `${active ? 2 : 1}px solid ${active ? theme.border : "rgba(255,255,255,.2)"}`,
                }}
              >
                <div className="w-full">{t.preview(item)}</div>
                <div className="mt-1 w-full truncate text-xs font-extrabold text-white">
                  {item.emoji ? `${item.emoji} ` : ""}
                  {item.name}
                </div>
                <span
                  className="mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold"
                  style={
                    active
                      ? { background: theme.accent, color: theme.accentInk }
                      : owned
                        ? { background: "rgba(255,255,255,.2)", color: "#fff" }
                        : { background: "linear-gradient(90deg, #FFD54F, #FF8F00)", color: "#221100" }
                  }
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        {/* a plain Close button at the bottom too (easy to reach with a thumb) */}
        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 w-full shrink-0 rounded-full bg-white/15 py-2 text-sm font-extrabold text-white"
        >
          Close
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[81] flex items-center justify-center bg-black/50 p-6" onClick={(e) => (e.stopPropagation(), setConfirm(null))}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-[#1b1b1f]" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold">
              {confirm.emoji ? `${confirm.emoji} ` : ""}
              {confirm.name}
            </div>
            <p className="mt-2 text-sm">
              Buy this {t.noun} for {confirm.price.toLocaleString()} coins? It stays on your account forever.
            </p>
            <div className="mt-3 flex justify-end gap-4 text-sm font-bold text-[#6750A4]">
              <button type="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  buy(c);
                }}
              >
                Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
