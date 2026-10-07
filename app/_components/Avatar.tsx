"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import {
  AVATAR_DEFAULT,
  AVATAR_ITEMS,
  AVATAR_SLOTS,
  avatarItem,
  avatarLayers,
  avatarThumb,
  fullLook,
  type AvatarItem,
  type AvatarLook,
  type AvatarSlotKey,
} from "../../lib/avatarParts";

// 🧍 miGlife avatars: a person made of picture layers (skin, hoodie, pants,
// shoes). Some items are free, the rest are bought with coins through
// buyAvatarItem; the chosen look is saved by setAvatarLook. Only those Cloud
// Functions write avatars/{uid}; everyone signed in can read it.

/** The avatar picture. `size` is the width; the height is twice that. */
export function AvatarView({ look, size, className = "" }: { look: Partial<Record<string, string>> | null | undefined; size: number; className?: string }) {
  const layers = useMemo(() => avatarLayers(fullLook(look)), [look]);
  return (
    <span className={`relative block shrink-0 ${className}`} style={{ width: size, height: size * 2 }}>
      {layers.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
      ))}
    </span>
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
          look: look && typeof look === "object" ? fullLook(look) : null,
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
const isNone = (it: AvatarItem) => !it.src;
const STEP_BTN = "w-full rounded-full bg-[#FF6B2C] py-3 text-base font-bold text-white shadow disabled:bg-[#D9D9D9]";
const STAGE = "bg-gradient-to-b from-[#DDF1FF] to-[#F4FAFF]";

/** The Avatar Maker: skin tone (first time), then dress up, buy, save. */
export function AvatarEditor({ uid, onBack }: { uid: string; onBack?: () => void }) {
  const saved = useAvatar(uid);
  const [step, setStep] = useState<"skin" | "edit" | null>(null);
  const [draft, setDraft] = useState<AvatarLook | null>(null);
  const [slot, setSlot] = useState<AvatarSlotKey>("top");
  const [basicsOnly, setBasicsOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AvatarItem | null>(null);

  // First time: choose a skin tone; afterwards straight to the maker.
  useEffect(() => {
    if (!saved.loaded || step) return;
    if (saved.look) {
      setDraft(saved.look);
      setStep("edit");
    } else setStep("skin");
  }, [saved.loaded, saved.look, step]);

  const look = draft || saved.look || AVATAR_DEFAULT;
  const owns = (it: AvatarItem | undefined) => !it || it.price === 0 || saved.owned.has(it.id);
  const unpaid = AVATAR_SLOTS.map((s) => avatarItem(look[s.key])).filter((it): it is AvatarItem => !!it && !owns(it));
  const changed = !saved.look || JSON.stringify(look) !== JSON.stringify(saved.look);

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
  const back = () => {
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
            onClick={() => setDraft(saved.look || { ...AVATAR_DEFAULT, skin: look.skin })}
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

  if (step === "skin") {
    return (
      <div className="overflow-hidden rounded-[22px] bg-[#FAFAFA] text-[#1b1b1f] shadow-xl">
        {header}
        <div className="flex min-h-[560px] flex-col px-4 pb-5 pt-6">
          <h3 className="text-center text-[22px] font-bold">Choose Your Skin Tone</h3>
          <p className="text-center text-xs text-[#9AA0A8]">Select the skin tone that represents you</p>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {AVATAR_ITEMS.filter((i) => i.slot === "skin").map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setDraft({ ...AVATAR_DEFAULT, skin: it.id })}
                className={`flex flex-col items-center overflow-hidden rounded-2xl border-2 bg-white pb-1.5 ${draft?.skin === it.id ? "border-[#FF6B2C]" : "border-[#EEF0F3]"}`}
              >
                <span className={`flex w-full justify-center py-2 ${STAGE}`}>
                  <AvatarView look={{ skin: it.id, top: "top_none", bottom: "bottom_none", shoes: "shoes_none" }} size={60} />
                </span>
                <span className="mt-1 text-xs font-bold">{it.name}</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={!draft} onClick={() => setStep("edit")} className={`${STEP_BTN} mt-auto`}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  const items = AVATAR_ITEMS.filter((it) => it.slot === slot && (!basicsOnly || it.price === 0));
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-[#FF6B2C] bg-[#FFF1EA] text-[#FF6B2C]" : "border-[#E4E7EB] bg-white text-[#6B7280]"}`;
  return (
    <div className="overflow-hidden rounded-[22px] bg-[#FAFAFA] text-[#1b1b1f] shadow-xl">
      {header}
      <div className="px-4 pt-3">
        <div className={`flex justify-center rounded-[22px] py-3 shadow-inner ${STAGE}`}>
          <AvatarView look={look} size={140} />
        </div>
      </div>
      {message && <p className="px-4 pt-2 text-center text-xs font-bold text-[#B26A00]">{message}</p>}

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-3">
        {AVATAR_SLOTS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSlot(t.key)}
            className={`shrink-0 rounded-lg border px-4 py-1.5 text-sm font-semibold ${slot === t.key ? "border-[#FF6B2C] bg-[#FF6B2C] text-white" : "border-[#E4E7EB] bg-white text-[#374151]"}`}
          >
            {slot === t.key ? "✓ " : ""}
            {t.label}
          </button>
        ))}
      </div>
      {slot !== "skin" && (
        <div className="mt-2 flex gap-1.5 px-3">
          <button type="button" onClick={() => setBasicsOnly(false)} className={chip(!basicsOnly)}>
            All packs
          </button>
          <button type="button" onClick={() => setBasicsOnly(true)} className={chip(basicsOnly)}>
            Basics
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5 p-3 sm:grid-cols-4">
        {items.map((it) => {
          const on = look[it.slot] === it.id;
          const own = owns(it);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setDraft({ ...look, [it.slot]: it.id })}
              className={`relative flex flex-col items-center rounded-2xl border-2 bg-white p-1.5 text-center ${on ? "border-[#FF6B2C]" : "border-[#EEF0F3]"}`}
            >
              {on && (
                <span className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF6B2C] text-[10px] font-black text-white">✓</span>
              )}
              <span className={`flex h-[78px] w-full items-center justify-center overflow-hidden rounded-lg ${STAGE}`}>
                {isNone(it) ? (
                  <span className="text-[34px] text-[#BDBDBD]">⦸</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarThumb(it)} alt="" loading="lazy" className="h-[74px] w-[74px] object-contain" />
                )}
              </span>
              <span className="mt-1 w-full truncate text-[11px] font-semibold">{it.name}</span>
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
              <span className={`overflow-hidden rounded-lg px-1 ${STAGE}`}>
                <AvatarView look={{ ...look, [confirm.slot]: confirm.id }} size={48} />
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
