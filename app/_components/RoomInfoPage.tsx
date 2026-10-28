"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import type { RoomInfo } from "../../lib/roomModeration";

// ℹ️ Room Info (the app's PrivateRoomInfoScreen): everyone can read it and open
// the edit mode (✎); only people allowed to update the room get their change
// saved. Values live on rooms/{room} (description, maxUsers, lockLevel,
// publicKick, allowMedia, allowVideo, moderators, superMods).

type Perms = {
  isUserRoom: boolean;
  isRoomAdmin: boolean;
  isRoomMod: boolean;
  isThisRoomOwner: boolean;
  canManagePrivate: boolean;
  canAssignSuperMod: boolean;
};

const lc = (s: string) => s.trim().toLowerCase();

function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_3px_12px_rgba(11,42,91,0.12)]">{children}</div>;
}

function Chip({ icon, text }: { icon?: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3FC] px-3 py-1.5 text-[13px] font-semibold text-[#0B2A5B]">
      {icon && <span>{icon}</span>}
      <span data-notranslate>{text}</span>
    </span>
  );
}

function bubbleFor(label: string) {
  if (/Notification|Owner/.test(label)) return "#FFF1D6";
  if (/Lock/.test(label)) return "#EBE3FB";
  if (/Kick/.test(label)) return "#FDE3E3";
  if (/audio/i.test(label)) return "#DDF6E7";
  if (/video/i.test(label)) return "#FCE1EF";
  return "#DDEEFC";
}

function Line({
  icon,
  label,
  value,
  sub,
  onClick,
  trailing,
}: {
  icon: string;
  label: string;
  value?: string;
  sub?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-lg" style={{ background: bubbleFor(label) }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] font-medium text-[#12233F]">{label}</span>
        {sub && (
          <span data-notranslate className="block truncate text-xs text-[#7D8DA6]">
            {sub}
          </span>
        )}
      </span>
      {value && (
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            value === "ON" ? "bg-[#DDF6E7] text-[#1E9E55]" : value === "OFF" ? "bg-[#EDEFF3] text-[#8A9AB2]" : "bg-[#DDEEFC] text-[#15589B]"
          }`}
        >
          {value}
        </span>
      )}
      {trailing}
    </>
  );
  return (
    <div className="border-b border-[#EDF2F8] last:border-b-0">
      {onClick ? (
        <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-[11px]">
          {body}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-3.5 py-[11px]">{body}</div>
      )}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#1F8BE6]" : "bg-[#C9D3E3]"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function PersonRow({ name, details, onDemote }: { name: string; details: string; onDemote?: () => void }) {
  return (
    <div className="mx-2.5 my-1 flex items-center gap-3 rounded-[14px] bg-[#F1F6FC] px-3 py-2.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#FFE08A] bg-gradient-to-br from-[#3B8BE6] to-[#0B2A5B] text-[17px] font-bold text-white">
        {name.charAt(0).toUpperCase() || "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span data-notranslate className="block truncate text-[15px] font-bold text-[#12233F]">
          {name}
        </span>
        {details && <span className="block truncate text-xs text-[#7D8DA6]">{details}</span>}
      </span>
      {onDemote && (
        <button type="button" onClick={onDemote} className="rounded-[10px] bg-[#E5484D] px-3.5 py-2 text-[13px] font-bold text-white">
          Demote
        </button>
      )}
    </div>
  );
}

export function RoomInfoPage({
  roomName,
  shownRoomName,
  ownerName,
  description,
  info,
  perms,
  roomMembers,
  modName,
  onClose,
  onNote,
  onSetEntryLevel,
  canTransferOwner = false,
}: {
  roomName: string;
  shownRoomName: string;
  ownerName: string;
  /** The text the room's welcome card shows (saved description or the built-in one). */
  description: string;
  info: RoomInfo;
  perms: Perms;
  roomMembers: string[];
  modName: string;
  onClose: () => void;
  onNote: (text: string) => void;
  /** Staff of a public room may change only its entry level (posts the room line). */
  onSetEntryLevel: (level: number) => void;
  /** 👑 miglife only: give this room to another MIG ID (server: founderTransferRoomOwner). */
  canTransferOwner?: boolean;
}) {
  const capacityEditable = !info.capacityEnforced;
  const showSuperMods = perms.isUserRoom;
  const showPublicKick = !perms.isUserRoom;
  const canManage = perms.isUserRoom ? perms.canManagePrivate : perms.isRoomAdmin;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    description,
    capacity: String(info.maxUsers),
    lock: info.lockLevel,
    publicKick: info.publicKick,
    media: info.allowMedia,
    video: info.allowVideo,
    mods: info.moderators,
    supers: info.superMods,
  }));
  const reset = () =>
    setDraft({
      description,
      capacity: String(info.maxUsers),
      lock: info.lockLevel,
      publicKick: info.publicKick,
      media: info.allowMedia,
      video: info.allowVideo,
      mods: info.moderators,
      supers: info.superMods,
    });
  // Leaving edit mode (or the room's values changing while viewing) shows the saved values.
  useEffect(() => {
    if (!editing) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, info, description]);

  const [superOpen, setSuperOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [dialog, setDialog] = useState<"" | "capacity" | "description" | "lock" | "addmod" | "addsuper" | "owner">("");
  const [transferring, setTransferring] = useState(false);
  const [dialogText, setDialogText] = useState("");
  const [toast, setToast] = useState("");
  const say = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? "" : x)), 2600);
  };

  // lowercase username → [name as written, "Female, Level: 50, Bangladesh"]
  const [modInfo, setModInfo] = useState<Record<string, [string, string]>>({});
  useEffect(() => {
    const missing = Array.from(new Set([...draft.mods, ...draft.supers])).filter((k) => !(k in modInfo));
    if (!missing.length) return;
    let gone = false;
    (async () => {
      const out: Record<string, [string, string]> = {};
      for (let i = 0; i < missing.length; i += 10) {
        try {
          const snap = await getDocs(query(collection(db, "users"), where("usernameLower", "in", missing.slice(i, i + 10))));
          snap.docs.forEach((d) => {
            const written = String(d.get("username") || "").trim();
            const key = String(d.get("usernameLower") || "") || lc(written);
            const level = d.get("level") != null ? `Level: ${d.get("level")}` : "";
            out[key] = [written || key, [d.get("gender"), level, d.get("country")].filter((x) => x && String(x).trim()).join(", ")];
          });
        } catch {
          // shown by name only
        }
      }
      if (!gone) setModInfo((m) => ({ ...m, ...out }));
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.mods, draft.supers]);

  const save = async () => {
    const authorized = perms.isUserRoom ? perms.canManagePrivate : perms.isRoomAdmin;
    const newCapacity = Number(draft.capacity) || null;
    const onlyLevelChanged =
      draft.description.trim() === description.trim() &&
      (newCapacity === null || String(newCapacity) === String(info.maxUsers)) &&
      draft.publicKick === info.publicKick &&
      draft.media === info.allowMedia &&
      draft.video === info.allowVideo;
    if (!authorized) {
      // Staff of a public room may change only its entry level.
      if (!perms.isUserRoom && perms.isRoomMod && onlyLevelChanged) {
        if (draft.lock !== info.lockLevel) onSetEntryLevel(draft.lock);
        setEditing(false);
        return;
      }
      say("You are not authorized to update this room!");
      return;
    }
    const updates: Record<string, unknown> = {
      // Every room's description (private rooms included) may use up to 300 characters.
      description: draft.description.trim().slice(0, 300),
      lockLevel: Math.max(0, Math.min(100, Math.trunc(draft.lock))),
      // Public Kick (a vote) exists only in public rooms.
      publicKick: draft.publicKick && !perms.isUserRoom,
      allowMedia: draft.media,
      allowVideo: draft.video,
      updatedBy: modName,
      updatedAt: serverTimestamp(),
    };
    if (perms.isUserRoom) {
      const supers = Array.from(new Set(draft.supers.map(lc).filter(Boolean))).slice(0, 10);
      updates.moderators = Array.from(new Set(draft.mods.map(lc).filter((k) => k && !supers.includes(k)))).slice(0, 20);
      // Only the owner (or an app admin) may change the Super Mod list.
      if (perms.canAssignSuperMod) updates.superMods = supers;
    } else {
      // A public room may have no document yet; the rules want its name then.
      updates.name = roomName;
    }
    if (newCapacity !== null && capacityEditable && (perms.isThisRoomOwner || perms.isRoomAdmin)) {
      updates.maxUsers = Math.max(1, Math.min(10000, Math.trunc(newCapacity)));
    }
    setEditing(false);
    try {
      await setDoc(doc(db, "rooms", roomName), updates, { merge: true });
      say("Room settings saved.");
    } catch (e: any) {
      const reason =
        e?.code === "permission-denied"
          ? "the server refused it (permission denied). Publish the latest Firestore rules and sign in as the founder or an admin."
          : e?.message || "unknown error";
      say(`Could not save: ${reason}`);
      onNote(`⚠️ Room settings were NOT saved: ${reason}`);
    }
  };

  const candidates = roomMembers.filter((n) => {
    const k = lc(n);
    return !draft.mods.includes(k) && !draft.supers.includes(k) && k !== lc(ownerName);
  });

  const peopleCard = (kind: "super" | "mod") => {
    const isSuper = kind === "super";
    const open = isSuper ? superOpen : modsOpen;
    const list = isSuper ? draft.supers : draft.mods;
    const canEditList = editing && (isSuper ? perms.canAssignSuperMod : canManage);
    return (
      <Card>
        <button type="button" onClick={() => (isSuper ? setSuperOpen(!superOpen) : setModsOpen(!modsOpen))} className="flex w-full items-center gap-2.5 px-4 py-3.5">
          <span className="text-lg">{isSuper ? "🌟" : "⭐"}</span>
          <span className="flex-1 text-left text-[15px] font-bold text-[#0B2A5B]">{isSuper ? "Super Moderator" : "Moderator"}</span>
          <Chip text={String(list.length)} />
          <span className="text-base text-[#7D8DA6]">{open ? "▴" : "▾"}</span>
        </button>
        {open && (
          <div className="pb-1.5">
            {list.length === 0 && <p className="px-4 py-1.5 text-[13px] text-[#7D8DA6]">{isSuper ? "No super moderators yet." : "No moderators yet."}</p>}
            {list.map((k) => (
              <PersonRow
                key={k}
                name={modInfo[k]?.[0] || k}
                details={modInfo[k]?.[1] || ""}
                onDemote={canEditList ? () => setDraft((d) => (isSuper ? { ...d, supers: d.supers.filter((x) => x !== k) } : { ...d, mods: d.mods.filter((x) => x !== k) })) : undefined}
              />
            ))}
            {canEditList && (
              <button
                type="button"
                onClick={() => setDialog(isSuper ? "addsuper" : "addmod")}
                className="mx-2.5 my-2 block w-[calc(100%-20px)] rounded-[14px] bg-[#15589B] py-3 text-sm font-bold text-white"
              >
                ＋ {isSuper ? "Add super moderator" : "Add moderator"}
              </button>
            )}
          </div>
        )}
      </Card>
    );
  };

  // Drawn on <body> (the room page sits under the site's top bar), starting
  // right below that bar — like the app, where the bar stays visible above.
  const [top, setTop] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const bar = document.querySelector("header");
    const measure = () => setTop(bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-gradient-to-b from-[#DDF1FF] to-[#F4FAFF]" style={{ top }}>
      {/* header: gradient, rounded bottom */}
      <div className="flex shrink-0 items-center gap-2 rounded-b-[26px] bg-gradient-to-r from-[#0B2A5B] to-[#15589B] px-3 pb-2.5 pt-2.5 shadow-lg">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (editing ? setEditing(false) : onClose())}
          className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-white"
        >
          ←
        </button>
        <h2 className="flex-1 truncate text-lg font-bold text-white">{editing ? "Edit Room Info" : "Room Info"}</h2>
        {/* Everyone sees the pencil; only people who may change something here
            (room admins / private-room managers, a public room's mods for the
            entry level) get into Edit Room Info — others just get the toast. */}
        <button
          type="button"
          aria-label={editing ? "Save" : "Edit"}
          onClick={() =>
            editing
              ? save()
              : canManage || (!perms.isUserRoom && perms.isRoomMod)
                ? setEditing(true)
                : say("You are not authorized to update this room!")
          }
          className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/50 bg-white/20 text-xl font-bold text-white"
        >
          {editing ? "✓" : "✎"}
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3.5 pb-10">
        {!editing ? (
          <>
            <Card>
              <div className="flex flex-col items-center p-[18px]">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#3B8BE6] to-[#0B2A5B] text-3xl">🏠</span>
                <p data-notranslate className="mt-2.5 text-center text-2xl font-extrabold text-[#0B2A5B]">
                  {shownRoomName}
                </p>
                <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                  <Chip icon="👑" text={ownerName || "-"} />
                  <Chip icon="👥" text={String(info.maxUsers)} />
                </div>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <p className="text-xs font-bold text-[#7D8DA6]">Description</p>
                <p data-notranslate className="mt-1 whitespace-pre-wrap text-sm text-[#12233F]">
                  {description || "No description."}
                </p>
              </div>
            </Card>
            <Card>
              <Line icon="🔒" label="Lock Level" value={String(info.lockLevel)} />
              {showPublicKick && <Line icon="👢" label="Public Kick" value={info.publicKick ? "ON" : "OFF"} />}
              <Line icon="🖼️" label="Image or audio share" value={info.allowMedia ? "ON" : "OFF"} />
              <Line icon="🎬" label="Video share" value={info.allowVideo ? "ON" : "OFF"} />
            </Card>
          </>
        ) : (
          <>
            <Card>
              <Line
                icon="👑"
                label="Owner"
                sub={ownerName || "-"}
                onClick={canTransferOwner ? () => (setDialogText(""), setDialog("owner")) : undefined}
                trailing={
                  canTransferOwner ? <span className="text-[17px] text-[#15589B]">✎</span> : <span className="text-lg text-[#B5C2D3]">✓</span>
                }
              />
              <Line
                icon="👥"
                label="Capacity"
                sub={draft.capacity}
                onClick={capacityEditable ? () => (setDialogText(draft.capacity), setDialog("capacity")) : undefined}
                trailing={<span className="text-[17px] text-[#15589B]">{capacityEditable ? "✎" : "🔒"}</span>}
              />
              <Line
                icon="📝"
                label="Description"
                sub={draft.description || "-"}
                onClick={() => (setDialogText(draft.description), setDialog("description"))}
                trailing={<span className="text-[17px] text-[#15589B]">✎</span>}
              />
              <Line
                icon="🔒"
                label="Lock Level"
                sub={String(draft.lock)}
                onClick={() => (setDialogText(String(draft.lock)), setDialog("lock"))}
                trailing={<span className="text-lg">🔐</span>}
              />
            </Card>
            <Card>
              {showPublicKick && (
                <Line
                  icon="👢"
                  label="Public Kick"
                  sub="A vote: 5 votes in 60 seconds kick a person"
                  trailing={<Switch on={draft.publicKick} onChange={(v) => setDraft((d) => ({ ...d, publicKick: v }))} />}
                />
              )}
              <Line icon="🖼️" label="Enable Audio/Image share" trailing={<Switch on={draft.media} onChange={(v) => setDraft((d) => ({ ...d, media: v }))} />} />
              <Line icon="🎬" label="Enable Video share" trailing={<Switch on={draft.video} onChange={(v) => setDraft((d) => ({ ...d, video: v }))} />} />
            </Card>
          </>
        )}

        {showSuperMods && peopleCard("super")}
        {peopleCard("mod")}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[70] flex justify-center px-4">
          <p className="rounded-full bg-[#1b1b1f]/90 px-4 py-2 text-center text-sm text-white shadow-lg">{toast}</p>
        </div>
      )}

      {/* small dialogs */}
      {(dialog === "capacity" || dialog === "description" || dialog === "lock") && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" onClick={() => setDialog("")}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-[#1b1b1f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">{dialog === "capacity" ? "Capacity" : dialog === "description" ? "Description" : "Lock Level"}</p>
            {dialog === "lock" && (
              <p className="mt-1 text-[13px] text-[#5B6B8C]">The lowest level allowed to enter this room. 0 = anyone. You, moderators and admins can always enter.</p>
            )}
            {dialog === "description" ? (
              <textarea
                value={dialogText}
                onChange={(e) => setDialogText(e.target.value.slice(0, 300))}
                rows={5}
                className="mt-3 w-full rounded-xl border border-[#D4DDEB] px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]"
              />
            ) : (
              <input
                value={dialogText}
                inputMode="numeric"
                onChange={(e) => setDialogText(e.target.value.replace(/\D/g, "").slice(0, dialog === "lock" ? 3 : 5))}
                className="mt-3 w-full rounded-xl border border-[#D4DDEB] px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]"
              />
            )}
            <div className="mt-4 flex justify-end gap-5 text-sm font-bold text-[#2F80ED]">
              <button type="button" onClick={() => setDialog("")}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (dialog === "capacity") setDraft((d) => ({ ...d, capacity: String(Math.max(1, Math.min(10000, Number(dialogText) || 1))) }));
                  else if (dialog === "description") setDraft((d) => ({ ...d, description: dialogText.trim() }));
                  else setDraft((d) => ({ ...d, lock: Math.max(0, Math.min(100, Number(dialogText) || 0)) }));
                  setDialog("");
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog === "owner" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" onClick={() => !transferring && setDialog("")}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-[#1b1b1f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">👑 Transfer ownership</p>
            <p className="mt-1 text-[13px] text-[#5B6B8C]">
              Write the MIG ID of the new owner of {shownRoomName}. The room moves to them at once (now: {ownerName || "-"}).
            </p>
            <input
              value={dialogText}
              placeholder="MIG ID"
              onChange={(e) => setDialogText(e.target.value.trim().slice(0, 40))}
              className="mt-3 w-full rounded-xl border border-[#D4DDEB] px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]"
            />
            <div className="mt-4 flex justify-end gap-5 text-sm font-bold text-[#2F80ED]">
              <button type="button" disabled={transferring} onClick={() => setDialog("")}>
                Cancel
              </button>
              <button
                type="button"
                disabled={transferring || !dialogText.trim()}
                className="disabled:opacity-40"
                onClick={async () => {
                  setTransferring(true);
                  try {
                    const { data } = await httpsCallable<{ roomName: string; newOwner: string }, { ownerName?: string }>(
                      functions,
                      "founderTransferRoomOwner"
                    )({ roomName, newOwner: dialogText.replace(/^@/, "").trim() });
                    say(`👑 ${data?.ownerName || dialogText} is now the owner of ${shownRoomName}`);
                    setDialog("");
                  } catch (e: any) {
                    say(e?.message || "Could not change the owner.");
                  } finally {
                    setTransferring(false);
                  }
                }}
              >
                {transferring ? "…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {(dialog === "addmod" || dialog === "addsuper") && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" onClick={() => setDialog("")}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-[#1b1b1f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">{dialog === "addsuper" ? "Add super moderator" : "Add moderator"}</p>
            {candidates.length === 0 ? (
              <p className="mt-2 text-sm text-[#5B6B8C]">
                Nobody else is in the room right now. A person must be in the room to be picked here (or use /mod or /smod with their name).
              </p>
            ) : (
              <ul className="mt-2 max-h-[50vh] overflow-y-auto">
                {candidates.map((n) => (
                  <li key={n} className="border-b border-[#EDF2F8]">
                    <button
                      type="button"
                      data-notranslate
                      onClick={() => {
                        const k = lc(n);
                        setDraft((d) => (dialog === "addsuper" ? { ...d, supers: [...d.supers, k] } : { ...d, mods: [...d.mods, k] }));
                        setDialog("");
                      }}
                      className="w-full py-3 text-left text-base"
                    >
                      {n}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-end text-sm font-bold text-[#2F80ED]">
              <button type="button" onClick={() => setDialog("")}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
