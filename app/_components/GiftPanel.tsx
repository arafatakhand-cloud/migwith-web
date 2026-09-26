"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

export type Gift = { name: string; icon: string; imageUrl: string; price: number };

export type GiftResult = {
  giftName: string;
  giftIcon: string;
  recipient: string;
  message: string;
};

type SendGiftResponse = {
  giftName?: string;
  giftIcon?: string;
  recipient?: string;
  message?: string;
};

const sendGiftCall = httpsCallable<
  { roomId: string; target: string; giftName: string; message: string },
  SendGiftResponse
>(functions, "sendGift");

// The active gift catalog, cheapest first. Shared with the chat so gift
// messages can show the gift's picture.
export async function loadGiftCatalog(): Promise<Gift[]> {
  const snap = await getDocs(collection(db, "gift_catalog"));
  return snap.docs
    .filter((d) => d.get("active") !== false)
    .map((d) => ({
      name: String(d.get("name") || "").trim(),
      icon: String(d.get("icon") || "🎁").trim(),
      imageUrl: String(d.get("imageUrl") || "").trim(),
      price: Number(d.get("price_coins") || 0),
    }))
    .filter((g) => g.name && g.price > 0)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

export function GiftPanel({
  roomId,
  uid,
  gifts,
  people,
  initialTarget,
  fixedTarget = false,
  onClose,
  onSent,
}: {
  roomId: string;
  uid: string;
  gifts: Gift[];
  people: string[];
  initialTarget: string;
  /** Private chat: the recipient is the friend and can't be changed. */
  fixedTarget?: boolean;
  onClose: () => void;
  onSent: (result: GiftResult) => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [target, setTarget] = useState(initialTarget);
  const [selected, setSelected] = useState<Gift | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Live coin balance (the server deducts it when a gift is sent).
  useEffect(
    () =>
      onSnapshot(doc(db, "users", uid), (snap) => {
        setBalance(Number(snap.get("balance") || 0));
      }),
    [uid]
  );

  const send = async () => {
    setError("");
    const cleanTarget = target.trim().replace(/^@/, "");

    if (!cleanTarget) {
      setError("Choose who gets the gift.");
      return;
    }
    if (!selected) {
      setError("Pick a gift.");
      return;
    }
    if (balance !== null && balance < selected.price) {
      setError(`Not enough coins for ${selected.name}.`);
      return;
    }

    try {
      setSending(true);
      const { data } = await sendGiftCall({
        roomId,
        target: cleanTarget,
        giftName: selected.name,
        message: message.trim().slice(0, 200),
      });
      onSent({
        giftName: data?.giftName || selected.name,
        giftIcon: data?.giftIcon || selected.icon,
        recipient: data?.recipient || cleanTarget,
        message: data?.message ?? message.trim().slice(0, 200),
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Gift sending failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 pb-safe sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-3xl border border-white/10 bg-[#0b1430] p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">🎁 Send a Gift</h2>
          <div className="text-sm text-amber-300">
            🪙 {balance === null ? "…" : balance.toLocaleString()}
          </div>
        </div>

        {/* Recipient */}
        {fixedTarget ? (
          <p className="mt-3 text-sm text-white/60">
            To <span className="font-bold text-pink-200">{target}</span>
          </p>
        ) : (
          <>
        <label className="mt-4 mb-1 block text-xs font-semibold text-white/60">To</label>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          list="gift-people"
          placeholder="MIG ID"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-pink-400/50"
        />
        <datalist id="gift-people">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {people.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {people.slice(0, 12).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTarget(p)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  target === p
                    ? "border-pink-400 bg-pink-500/20 text-pink-200"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

          </>
        )}

        {/* Gifts */}
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {gifts.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-white/40">Loading gifts…</p>
          )}
          {gifts.map((g) => {
            const sel = selected?.name === g.name;
            const cantAfford = balance !== null && balance < g.price;
            return (
              <button
                key={g.name}
                type="button"
                onClick={() => setSelected(g)}
                className={`flex flex-col items-center rounded-2xl border p-2 text-center transition ${
                  sel
                    ? "border-pink-400 bg-pink-500/15"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                } ${cantAfford ? "opacity-45" : ""}`}
              >
                {g.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.imageUrl} alt={g.name} className="h-10 w-10 object-contain" />
                ) : (
                  <span className="text-3xl leading-10">{g.icon}</span>
                )}
                <span className="mt-1 w-full truncate text-xs font-semibold">{g.name}</span>
                <span className="text-[11px] text-amber-300">🪙 {g.price.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {/* Message */}
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          placeholder="Message (optional)"
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-pink-400/50"
        />

        {error && (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || !selected || !target.trim()}
            className="flex-[2] rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-sm font-bold disabled:opacity-40"
          >
            {sending
              ? "Sending…"
              : selected
                ? `Send ${selected.name} · 🪙 ${selected.price.toLocaleString()}`
                : "Pick a gift"}
          </button>
        </div>
      </div>
    </div>
  );
}
