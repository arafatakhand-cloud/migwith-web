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

/** Draws layers of parts with the look's skin / hair colours, inside `viewBox`. */
function AvatarSvg({
  parts,
  look,
  width,
  height,
  viewBox,
  className = "",
}: {
  parts: AvatarPart[][];
  look: AvatarLook;
  width: number;
  height: number;
  viewBox: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const colors = { ...(avatarItem(look.skin)?.colors || {}), ...(avatarItem(look.hairColor)?.colors || {}) };
  const col = (v?: string) => (v && v[0] === "$" ? colors[v.slice(1)] || "#000" : v);
  const grads: [string, string, string][] = [];
  const paths = parts.flatMap((ps, li) =>
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
    <svg width={width} height={height} viewBox={viewBox} className={className} aria-hidden>
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

/** The avatar picture. `size` is the width; the height is 4/3 of it. */
export function AvatarView({ look, size, className = "" }: { look: AvatarLook | null | undefined; size: number; className?: string }) {
  const full = useMemo(() => fullLook(look), [look]);
  return <AvatarSvg parts={layers(full)} look={full} width={size} height={Math.round((size * 4) / 3)} viewBox="0 0 120 160" className={className} />;
}

// Item pictures in the maker: the item alone (face items on a bare head), zoomed in.
const THUMB_BOX: Record<string, [number, number, number, number]> = {
  eyes: [30, 34, 60, 40],
  mouth: [38, 46, 44, 34],
  hair: [8, -6, 104, 104],
  hairColor: [8, -6, 104, 104],
  glasses: [24, 32, 72, 44],
  hat: [4, -8, 112, 80],
  top: [18, 72, 84, 84],
  bottom: [26, 108, 68, 50],
  shoes: [34, 128, 52, 32],
  pet: [78, 100, 42, 60],
  bg: [0, 0, 120, 160],
};
const FACE_SLOTS = new Set(["eyes", "mouth", "hair", "hairColor", "glasses", "hat"]);

function ItemThumb({ item, look, size }: { item: AvatarItem; look: AvatarLook; size: number }) {
  const [x, y, w, h] = THUMB_BOX[item.slot] || [0, 0, 120, 160];
  const shown = { ...look, [item.slot]: item.id };
  const hairItem = avatarItem(item.slot === "hairColor" ? (look.hair === "hair_none" ? "hair_short" : look.hair) : shown.hair);
  const hair = item.slot === "hair" || item.slot === "hairColor" ? hairItem?.parts || [] : [];
  const parts: AvatarPart[][] = FACE_SLOTS.has(item.slot)
    ? [
        hair.filter((p) => p.z === "back"),
        AVATAR_BASE.head,
        item.slot === "eyes" || item.slot === "mouth" ? item.parts : [],
        hair.filter((p) => p.z !== "back"),
        item.slot === "glasses" || item.slot === "hat" ? item.parts : [],
      ]
    : [item.parts];
  const tall = h > w;
  return (
    <AvatarSvg
      parts={parts}
      look={shown}
      width={tall ? Math.round((size * w) / h) : size}
      height={tall ? size : Math.round((size * h) / w)}
      viewBox={`${x} ${y} ${w} ${h}`}
    />
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

// The Avatar Maker tabs, like the app: Face / Top / Bottom / Full / Scene,
// each with its own parts. "Outfit" (Full) are the long dresses that replace
// top + bottom.
const MAKER_TABS: { key: string; label: string; subs: [string, string][] }[] = [
  { key: "face", label: "Face", subs: [["skin", "Skin"], ["eyes", "Eyes"], ["mouth", "Mouth"], ["hair", "Hair"], ["hairColor", "Hair Colour"], ["glasses", "Glasses"], ["hat", "Headgear"]] },
  { key: "top", label: "Top", subs: [["top", "Top"]] },
  { key: "bottom", label: "Bottom", subs: [["bottom", "Bottom"], ["shoes", "Shoes"]] },
  { key: "full", label: "Full", subs: [["outfit", "Outfit"]] },
  { key: "scene", label: "Scene", subs: [["bg", "Background"], ["pet", "Pet"]] },
];

// Starting clothes for a new avatar (all free).
const GENDER_LOOK: Record<"m" | "f", AvatarLook> = {
  m: { hair: "hair_short", top: "top_tee_blue", bottom: "bot_jeans", eyes: "eyes_round" },
  f: { hair: "hair_long", top: "top_tee_red", bottom: "bot_jeans", eyes: "eyes_round" },
};

const isNone = (it: AvatarItem) => it.id.startsWith("none_") || it.id === "hair_none";
const NONE_OUTFIT: AvatarItem = { id: "none_outfit", slot: "top", name: "None", price: 0, parts: [] };

function subItems(sub: string): AvatarItem[] {
  if (sub === "top") return AVATAR_ITEMS.filter((i) => i.slot === "top" && !i.hidesBottom);
  if (sub === "outfit") return [NONE_OUTFIT, ...AVATAR_ITEMS.filter((i) => i.slot === "top" && i.hidesBottom)];
  return AVATAR_ITEMS.filter((i) => i.slot === sub);
}

const STEP_BTN = "w-full rounded-full bg-[#FF6B2C] py-3 text-base font-bold text-white shadow disabled:bg-[#D9D9D9]";

/** The Avatar Maker: gender → skin tone (first time), then dress up, buy, save. */
export function AvatarEditor({ uid, onBack }: { uid: string; onBack?: () => void }) {
  const saved = useAvatar(uid);
  const [step, setStep] = useState<"gender" | "skin" | "edit" | null>(null);
  const [gender, setGender] = useState<"m" | "f" | null>(null);
  const [draft, setDraft] = useState<AvatarLook | null>(null);
  const [tab, setTab] = useState(MAKER_TABS[0]);
  const [sub, setSub] = useState(MAKER_TABS[0].subs[1][0]);
  const [basicsOnly, setBasicsOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AvatarItem | null>(null);

  // First time: choose gender and skin tone; afterwards straight to the maker.
  useEffect(() => {
    if (!saved.loaded || step) return;
    if (saved.look) {
      setDraft(fullLook(saved.look));
      setStep("edit");
    } else setStep("gender");
  }, [saved.loaded, saved.look, step]);

  const look = draft || fullLook(saved.look);
  const owns = (it: AvatarItem | undefined) => isFree(it) || (!!it && saved.owned.has(it.id));
  const unpaid = AVATAR_SLOTS.map((s) => avatarItem(look[s.key])).filter((it): it is AvatarItem => !!it && !owns(it));
  const changed = !saved.look || JSON.stringify(look) !== JSON.stringify(fullLook(saved.look));

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
  const pick = (it: AvatarItem) => {
    // "None" under Outfit takes the dress off (back to a free top).
    if (sub === "outfit" && isNone(it)) return setDraft({ ...look, top: avatarItem(look.top)?.hidesBottom ? AVATAR_DEFAULT.top : look.top });
    setDraft({ ...look, [it.slot]: it.id });
  };
  const back = () => {
    if (step === "skin") return setStep("gender");
    if (step === "edit" && !saved.look) return setStep("skin");
    onBack?.();
  };

  const header = (
    <div className="flex items-center gap-2 border-b border-[#EEF0F3] bg-white px-2 py-2.5">
      <button type="button" onClick={back} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#1b1b1f]">
        ←
      </button>
      <h2 className="flex-1 text-center text-[17px] font-bold text-[#1b1b1f]">Avatar Maker</h2>
      {step === "edit" ? (
        <>
          <button
            type="button"
            title="Start over"
            onClick={() => setDraft(saved.look ? fullLook(saved.look) : fullLook({ ...GENDER_LOOK[gender || "m"], skin: look.skin }))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#1b1b1f]"
          >
            ↻
          </button>
          <button
            type="button"
            title="Save"
            onClick={save}
            disabled={!!busy || !changed}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#FF6B2C] disabled:opacity-40"
          >
            {busy === "save" ? "…" : "💾"}
          </button>
        </>
      ) : (
        <span className="w-9" />
      )}
    </div>
  );

  if (!step) return <div className="overflow-hidden rounded-[22px] bg-white">{header}<p className="py-16 text-center text-sm text-[#5B6B8C]">Loading…</p></div>;

  if (step === "gender" || step === "skin") {
    const genderLook = GENDER_LOOK[gender || "m"];
    return (
      <div className="overflow-hidden rounded-[22px] bg-[#FAFAFA] text-[#1b1b1f] shadow-xl">
        {header}
        <div className="flex min-h-[560px] flex-col px-4 pb-5 pt-6">
          <h3 className="text-center text-[22px] font-bold">{step === "gender" ? "Choose Your Gender" : "Choose Your Skin Tone"}</h3>
          <p className="text-center text-xs text-[#9AA0A8]">{step === "gender" ? "Select your avatar gender" : "Select the skin tone that represents you"}</p>
          {step === "gender" ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {([["m", "♂", "Male"], ["f", "♀", "Female"]] as const).map(([g, sym, label]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGender(g);
                    setStep("skin");
                  }}
                  className={`flex flex-col items-center rounded-2xl border-2 bg-white py-6 ${gender === g ? "border-[#FF6B2C]" : "border-[#EEF0F3]"}`}
                >
                  <span className="text-[40px] leading-none text-[#555]">{sym}</span>
                  <span className="mt-2 text-sm font-bold">{label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {AVATAR_ITEMS.filter((i) => i.slot === "skin").map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setDraft(fullLook({ ...genderLook, skin: it.id }))}
                  className={`flex flex-col items-center rounded-2xl border-2 bg-white pb-1.5 ${draft?.skin === it.id ? "border-[#FF6B2C]" : "border-[#EEF0F3]"}`}
                >
                  <AvatarSvg
                    parts={[AVATAR_BASE.body, avatarItem("bot_shorts")?.parts || [], AVATAR_BASE.head]}
                    look={{ ...AVATAR_DEFAULT, skin: it.id }}
                    width={84}
                    height={112}
                    viewBox="0 0 120 160"
                  />
                  <span className="text-xs font-bold">{it.name}</span>
                </button>
              ))}
            </div>
          )}
          {step === "skin" && (
            <button type="button" disabled={!draft} onClick={() => setStep("edit")} className={`${STEP_BTN} mt-auto`}>
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }

  const items = subItems(sub).filter((it) => !basicsOnly || it.price === 0);
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-[#FF6B2C] bg-[#FFF1EA] text-[#FF6B2C]" : "border-[#E4E7EB] bg-white text-[#6B7280]"}`;
  return (
    <div className="overflow-hidden rounded-[22px] bg-[#FAFAFA] text-[#1b1b1f] shadow-xl">
      {header}
      <div className="flex justify-center px-4 pt-3">
        <div className="overflow-hidden rounded-[22px] bg-[#F2F2F2] shadow-inner">
          <AvatarView look={look} size={168} />
        </div>
      </div>
      {message && <p className="px-4 pt-2 text-center text-xs font-bold text-[#B26A00]">{message}</p>}

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-3">
        {MAKER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t);
              setSub(t.subs[0][0]);
            }}
            className={`shrink-0 rounded-lg border px-4 py-1.5 text-sm font-semibold ${tab.key === t.key ? "border-[#FF6B2C] bg-[#FF6B2C] text-white" : "border-[#E4E7EB] bg-white text-[#374151]"}`}
          >
            {tab.key === t.key ? "✓ " : ""}
            {t.label}
          </button>
        ))}
      </div>
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-3">
        {tab.subs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSub(k)} className={chip(sub === k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 px-3">
        <button type="button" onClick={() => setBasicsOnly(false)} className={chip(!basicsOnly)}>
          All packs
        </button>
        <button type="button" onClick={() => setBasicsOnly(true)} className={chip(basicsOnly)}>
          Basics
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 p-3 sm:grid-cols-4">
        {items.map((it) => {
          const on = sub === "outfit" && isNone(it) ? !avatarItem(look.top)?.hidesBottom : look[it.slot] === it.id;
          const own = owns(it);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => pick(it)}
              className={`relative flex flex-col items-center rounded-2xl border-2 bg-white p-1.5 text-center ${on ? "border-[#FF6B2C]" : "border-[#EEF0F3]"}`}
            >
              {on && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF6B2C] text-[10px] font-black text-white">✓</span>
              )}
              <span className="flex h-[78px] w-full items-center justify-center overflow-hidden rounded-lg">
                {isNone(it) ? (
                  <span className="text-[34px] text-[#BDBDBD]">⦸</span>
                ) : it.slot === "skin" ? (
                  <AvatarSvg parts={[AVATAR_BASE.head]} look={{ ...look, skin: it.id }} width={70} height={70} viewBox="24 16 72 72" />
                ) : (
                  <ItemThumb item={it} look={look} size={74} />
                )}
              </span>
              <span className="mt-1 w-full truncate text-[11px] font-semibold">{isNone(it) ? "None" : it.name}</span>
              {own ? (
                it.price > 0 && <span className="text-[10px] font-bold text-[#1B8A3A]">✓ Owned</span>
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
            <div className="mt-3 flex justify-end gap-4 text-sm font-bold text-[#FF6B2C]">
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
