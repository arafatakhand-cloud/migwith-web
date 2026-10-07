"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { AVATAR_BASE, AVATAR_DEFAULT, AVATAR_ITEMS, AVATAR_SLOTS, type AvatarItem, type AvatarPart } from "../../lib/avatarData";

// 🧍 miGlife avatars (the app's AvatarSystem.kt): a cartoon person built from
// layers — background, skin, hair, eyes, mouth, top, bottom, shoes, glasses,
// hat and a pet. Some items are free, the rest are bought with coins through
// buyAvatarItem; the chosen look is saved by setAvatarLook. Only those Cloud
// Functions write avatars/{uid}; everyone signed in can read it.

export type AvatarLook = Record<string, string>;

const BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));
export const avatarItem = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/** A saved look with every slot filled (unknown ids fall back to the default). */
export function fullLook(look: AvatarLook | null | undefined): AvatarLook {
  const out: AvatarLook = { ...AVATAR_DEFAULT };
  for (const s of AVATAR_SLOTS) {
    const id = look?.[s.key];
    const it = avatarItem(id);
    if (it && it.slot === s.key) out[s.key] = it.id;
  }
  return out;
}

/** The layers in drawing order, like the app. */
function layers(look: AvatarLook): AvatarPart[][] {
  const it = (slot: string) => avatarItem(look[slot])?.parts || [];
  const hair = it("hair");
  const top = avatarItem(look.top);
  return [
    it("bg"),
    hair.filter((p) => p.z === "back"),
    AVATAR_BASE.body,
    top?.hidesBottom ? [] : it("bottom"),
    it("shoes"),
    it("top"),
    AVATAR_BASE.head,
    it("eyes"),
    it("mouth"),
    hair.filter((p) => p.z !== "back"),
    it("glasses"),
    it("hat"),
    it("pet"),
  ];
}

/** The avatar picture. `size` is the width; the height is 4/3 of it. */
export function AvatarView({ look, size, className = "" }: { look: AvatarLook | null | undefined; size: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const full = useMemo(() => fullLook(look), [look]);
  const colors = { ...(avatarItem(full.skin)?.colors || {}), ...(avatarItem(full.hairColor)?.colors || {}) };
  const col = (v?: string) => (v && v[0] === "$" ? colors[v.slice(1)] || "#000" : v);
  const grads: [string, string, string][] = [];
  const paths = layers(full).flatMap((ps, li) =>
    ps.map((p, pi) => {
      let fill = p.fill;
      if (fill.startsWith("grad:")) {
        const [a, b] = fill.slice(5).split(",");
        const id = `${uid}g${grads.length}`;
        grads.push([id, a, b]);
        fill = `url(#${id})`;
      } else fill = col(fill) || "none";
      return (
        <path
          key={`${li}_${pi}`}
          d={p.d}
          fill={fill}
          stroke={p.stroke ? col(p.stroke) : undefined}
          strokeWidth={p.stroke ? p.sw || 1 : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    })
  );
  return (
    <svg width={size} height={Math.round((size * 4) / 3)} viewBox="0 0 120 160" className={className} aria-hidden>
      <defs>
        {grads.map(([id, a, b]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        ))}
      </defs>
      {paths}
    </svg>
  );
}

/** avatars/{uid}: the saved look (null = never made one) and the owned items. */
export function useAvatar(uid: string | undefined | null) {
  const [state, setState] = useState<{ look: AvatarLook | null; owned: Set<string>; loaded: boolean }>({
    look: null,
    owned: new Set(),
    loaded: false,
  });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "avatars", uid),
      (snap) => {
        const look = snap.get("look");
        const owned = snap.get("owned");
        setState({
          look: look && typeof look === "object" ? (look as AvatarLook) : null,
          owned: new Set(owned && typeof owned === "object" ? Object.keys(owned).filter((k) => owned[k]) : []),
          loaded: true,
        });
      },
      () => setState((s) => ({ ...s, loaded: true }))
    );
  }, [uid]);
  return state;
}

const opId = () => "av_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const isFree = (it: AvatarItem | undefined) => !it || it.price === 0;

/** The avatar maker: try anything on, buy the paid items, save the look. */
export function AvatarEditor({ uid }: { uid: string }) {
  const saved = useAvatar(uid);
  const [draft, setDraft] = useState<AvatarLook | null>(null);
  const [slot, setSlot] = useState(AVATAR_SLOTS[2].key);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AvatarItem | null>(null);

  useEffect(() => {
    if (saved.loaded && !draft) setDraft(fullLook(saved.look));
  }, [saved.loaded, saved.look, draft]);
  const look = draft || fullLook(saved.look);
  const owns = (it: AvatarItem | undefined) => isFree(it) || (!!it && saved.owned.has(it.id));
  const unpaid = AVATAR_SLOTS.map((s) => avatarItem(look[s.key])).filter((it): it is AvatarItem => !!it && !owns(it));
  const changed = JSON.stringify(look) !== JSON.stringify(fullLook(saved.look)) || !saved.look;

  const save = async () => {
    if (unpaid.length) return setMessage(`Buy ${unpaid.map((i) => i.name).join(", ")} first (or pick something else).`);
    setBusy("save");
    try {
      await httpsCallable(functions, "setAvatarLook")({ look });
      setMessage("✓ Avatar saved — everyone sees it on your profile.");
    } catch (e: any) {
      setMessage(e?.message || "Could not save.");
    } finally {
      setBusy(null);
    }
  };
  const buy = async (it: AvatarItem) => {
    setBusy(it.id);
    try {
      await httpsCallable(functions, "buyAvatarItem")({ id: it.id, operationId: opId() });
      setMessage(`${it.name} is yours!`);
    } catch (e: any) {
      setMessage(e?.message || "Purchase failed.");
    } finally {
      setBusy(null);
    }
  };
  const randomFree = () => {
    const next: AvatarLook = {};
    for (const s of AVATAR_SLOTS) {
      const pool = AVATAR_ITEMS.filter((i) => i.slot === s.key && owns(i));
      next[s.key] = pool[Math.floor(Math.random() * pool.length)].id;
    }
    setDraft(next);
  };

  const items = AVATAR_ITEMS.filter((i) => i.slot === slot);
  return (
    <div className="overflow-hidden rounded-[22px] bg-white text-[#0B2A5B] shadow-xl">
      <div className="flex gap-3 bg-gradient-to-b from-[#3A3A3A] to-[#1C1C1C] p-3 text-white">
        <div className="shrink-0 overflow-hidden rounded-xl border-2 border-white/80 bg-white">
          <AvatarView look={look} size={132} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-lg font-black">🧍 My Avatar</h2>
          <p className="text-[11px] text-white/70">Try anything on. Free items are yours; the others are bought once with coins and stay on your account.</p>
          {message && <p className="mt-1 text-xs font-bold text-[#FFD27A]">{message}</p>}
          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={!!busy || !changed}
              className="rounded-lg border border-[#B8350A] bg-gradient-to-b from-[#FF9A3C] to-[#E8480C] px-4 py-1.5 text-sm font-bold disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={randomFree} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold">
              🎲 Random
            </button>
            {changed && saved.look && (
              <button type="button" onClick={() => setDraft(fullLook(saved.look))} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold">
                Undo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-[#E3ECF7] px-2 py-2">
        {AVATAR_SLOTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSlot(s.key)}
            className={`flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-[10px] font-bold ${slot === s.key ? "bg-[#DCEBFB] text-[#174EA6]" : "text-[#5B6B8C]"}`}
          >
            <span className="text-lg leading-6">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 p-2.5 sm:grid-cols-4">
        {items.map((it) => {
          const on = look[it.slot] === it.id;
          const own = owns(it);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setDraft({ ...look, [it.slot]: it.id })}
              className={`flex flex-col items-center rounded-2xl p-1.5 text-center ${on ? "bg-[#EAF4FE] ring-2 ring-[#2F80ED]" : "bg-[#F6F8FB]"}`}
            >
              <span className="overflow-hidden rounded-lg">
                <AvatarView look={{ ...look, [it.slot]: it.id }} size={78} />
              </span>
              <span className="mt-1 w-full truncate text-[11px] font-bold">{it.name}</span>
              {own ? (
                <span className="text-[10px] font-bold text-[#1B8A3A]">{it.price === 0 ? "FREE" : "✓ Owned"}</span>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm(it);
                  }}
                  className="mt-0.5 rounded-full bg-gradient-to-r from-[#FFD54F] to-[#FF8F00] px-2 py-0.5 text-[10px] font-extrabold text-[#221100]"
                >
                  {busy === it.id ? "…" : `🪙 ${it.price.toLocaleString("en-US")}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-[#1b1b1f]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="overflow-hidden rounded-lg">
                <AvatarView look={{ ...look, [confirm.slot]: confirm.id }} size={64} />
              </span>
              <p className="text-base font-bold">{confirm.name}</p>
            </div>
            <p className="mt-2 text-sm">Buy this for {confirm.price.toLocaleString("en-US")} coins? It stays on your account forever.</p>
            <div className="mt-3 flex justify-end gap-4 text-sm font-bold text-[#6750A4]">
              <button type="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  setDraft({ ...look, [c.slot]: c.id });
                  buy(c);
                }}
              >
                Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
