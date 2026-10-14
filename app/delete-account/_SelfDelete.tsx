"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { requestAccountDeletion } from "../../lib/accountDeletion";
import { clearRememberedAmounts } from "../../lib/amountMemory";
import { detachPushForLogout } from "../../lib/push";
import { leaveAllOpenRooms } from "../../lib/openRooms";
import { markOfflineForLogout } from "../../lib/heartbeat";

// 🗑 On /delete-account (Settings → Account → Delete account opens it): logged
// in → a "Delete my account" button right here; logged out → Login first.
export function SelfDeleteButton() {
  const { user, loading } = useSession() as ReturnType<typeof useSession> & { loading?: boolean };
  const [open, setOpen] = useState(false);
  if (!user) {
    return (
      <Link href="/login" className="inline-block rounded-xl bg-[#2F80ED] px-5 py-3 font-bold text-white shadow-sm">
        {loading ? "…" : "Log in to delete your account"}
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-block rounded-xl bg-[#D93025] px-5 py-3 font-bold text-white shadow-sm">
        🗑 Delete my account
      </button>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]";
const primary = "flex-1 rounded-xl bg-[#2F80ED] py-3 text-sm font-black text-white disabled:opacity-50";
const secondary = "flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]";

// 🗑 Delete account: type DELETE → the server schedules it (7 days), every
// device is signed out. Logging in again within 7 days cancels it.
function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useSession();
  const onDone = async () => {
    const uid = user?.uid;
    await detachPushForLogout();
    if (uid) await leaveAllOpenRooms(uid);
    await markOfflineForLogout(uid);
    clearRememberedAmounts();
    await signOut(auth);
    window.location.href = "/welcome";
  };
  const [coins, setCoins] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneAt, setDoneAt] = useState(0);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid))
      .then((s) => setCoins(Number(s.get("balance") || 0)))
      .catch(() => setCoins(0));
  }, [user]);

  const go = async () => {
    if (typed.trim() !== "DELETE") return setError("Type DELETE (capital letters) to confirm.");
    setBusy(true);
    setError("");
    try {
      const r = await requestAccountDeletion({ confirm: "DELETE" });
      setDoneAt(r.data.scheduledAt || Date.now() + 7 * 86400000);
    } catch (e: any) {
      setError(e?.message || "Could not delete the account.");
    } finally {
      setBusy(false);
    }
  };

  if (doneAt) {
    return (
      <Modal title="🗑 Account deletion scheduled" onClose={() => {}}>
        <p className="text-sm leading-5 text-[#5B6B8C]">
          Your account will be deleted on{" "}
          <b>{new Date(doneAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</b>. You are being
          logged out on every device. Changed your mind? Just log in again before that date.
        </p>
        <div className="flex">
          <button type="button" className={primary} onClick={() => onDone()}>
            OK
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="🗑 Delete account" onClose={() => !busy && onClose()}>
      <p className="text-sm leading-5 text-[#5B6B8C]">
        Your MIG ID, profile, photos, friends, mail, coins, XP and game items will be permanently deleted after <b>7 days</b>.
        Logging in again within those 7 days cancels it.
      </p>
      {coins !== null && coins > 0 && (
        <p className="rounded-xl bg-[#FFF4E5] px-3 py-2 text-sm font-semibold text-[#8A4B00]">
          ⚠️ You have {coins.toLocaleString("en-US")} coins. They will be lost and can&apos;t be brought back.
        </p>
      )}
      <p className="text-xs text-[#5B6B8C]">
        Your old chat messages stay for other people as “Deleted user”.{" "}
        <a href="/delete-account" target="_blank" rel="noreferrer" className="font-semibold text-[#2F80ED] underline">
          What is deleted
        </a>
      </p>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type DELETE" className={input} autoCapitalize="characters" />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={go} disabled={busy} className="flex-1 rounded-xl bg-[#D93025] py-3 text-sm font-black text-white disabled:opacity-50">
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </Modal>
  );
}
