"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { functions, storage } from "../../../lib/firebase";

// Saved by the server (not straight into Firestore), so a rules hiccup can't block miglife.
const ceoSetMediaPermission = httpsCallable<{ roleKey: string; picture: boolean; voice: boolean; video: boolean }, { ok: boolean }>(
  functions,
  "ceoSetMediaPermission"
);
const ceoSetBadgeImage = httpsCallable<{ docId: string; key: string; url: string }, { ok: boolean }>(functions, "ceoSetBadgeImage");
const ceoGetSharePermissions = httpsCallable<
  Record<string, never>,
  { permissions: Record<string, unknown>; badgeImages: Record<string, unknown>; levelBadgeImages: Record<string, unknown> }
>(functions, "ceoGetSharePermissions");
import { useFounderPerms } from "../../../lib/founder";
import { LEVEL_TIERS } from "../../../lib/rooms";
import { FounderShell } from "../_Shell";

// The miGlife level badge pictures served by the website (public/level-badges).
const LEVEL_BADGE_PACK_BASE = "https://web.miglife.app/level-badges";

// 🔐 Share Permissions (founder tool), like the app's MediaSharePermissionsPage:
// who may share pictures / voice / video, and the badge / level-badge pictures.

const ROLES: [string, string, string][] = [
  ["REGULAR", "Normal User", "👤"],
  ["MENTOR", "Mentor", "💼"],
  ["MERCHANT", "Merchant", "🛒"],
  ["king", "Emperor", "👑"],
  ["queen", "Angel", "👼"],
  ["mafia", "Don", "🎩"],
  ["vip", "Star", "⭐"],
  ["diamond", "Platinum", "💎"],
  ["premium", "Royal", "🏵️"],
  ["supporter", "Patron", "🛡️"],
  ["streamer", "Icon", "🎬"],
  ["ELITE_USER", "Honor Member", "✨"],
  ["EXECUTIVE_BOARD", "Executive Board", "🏛️"],
  ["COUNTRY_REPRESENTATIVE", "Country Representative", "🌍"],
  ["STAFF", "Staff", "🛠️"],
  ["ADMIN", "Admin", "⚙️"],
  ["OWNER", "Owner", "👑"],
];

type Perm = { picture: boolean; voice: boolean; video: boolean };

export default function SharePermissionsPage() {
  const f = useFounderPerms();
  const [perms, setPerms] = useState<Record<string, Perm>>({});
  const [badges, setBadges] = useState<Record<string, string>>({});
  const [levelBadges, setLevelBadges] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // Read by the server (ceoGetSharePermissions) — shows exactly what is saved.
  const load = () =>
    ceoGetSharePermissions({})
      .then(({ data }) => {
        const out: Record<string, Perm> = {};
        ROLES.forEach(([k]) => {
          const m = ((data.permissions || {})[k] || {}) as Record<string, unknown>;
          out[k] = { picture: m.picture === true, voice: m.voice === true, video: m.video === true };
        });
        setPerms(out);
        setBadges((data.badgeImages || {}) as Record<string, string>);
        setLevelBadges((data.levelBadgeImages || {}) as Record<string, string>);
      })
      .catch((e) => setStatus(e?.message || "Could not load."));
  useEffect(() => {
    if (!f.can("share_permissions")) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded]);

  const setPerm = (key: string, next: Perm) => {
    const prev = perms[key];
    setPerms((p) => ({ ...p, [key]: next }));
    ceoSetMediaPermission({ roleKey: key, ...next })
      .then(() => setStatus("Saved."))
      .catch((e) => {
        setPerms((p) => ({ ...p, [key]: prev }));
        setStatus(e?.message || "Setting save failed.");
      });
  };

  const upload = async (docId: "badge_images" | "level_badge_images", key: string, file: File | undefined) => {
    if (!file) return;
    setUploading(`${docId}/${key}`);
    setStatus("");
    try {
      const r = storageRef(storage, `${docId}/${key}.jpg`);
      await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
      await ceoSetBadgeImage({ docId, key, url: await getDownloadURL(r) });
      await load();
    } catch (e: any) {
      setStatus(e?.message || "Badge image upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const ImageRow = ({ docId, k, icon, label, url }: { docId: "badge_images" | "level_badge_images"; k: string; icon: string; label: string; url?: string }) => (
    <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#F1F5FB] text-lg">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={`h-full w-full ${docId === "level_badge_images" ? "object-contain" : "object-cover"}`} />
        ) : (
          icon
        )}
      </span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <label className="cursor-pointer rounded-full bg-[#EAF1FB] px-3 py-1 text-xs font-bold text-[#15589B]">
        {uploading === `${docId}/${k}` ? "Uploading…" : "Upload"}
        <input type="file" accept="image/*" hidden onChange={(e) => upload(docId, k, e.target.files?.[0])} />
      </label>
      {url && (
        <button type="button" onClick={() =>
            ceoSetBadgeImage({ docId, key: k, url: "" })
              .then(load)
              .catch((e) => setStatus(e?.message || "Could not reset."))
          } className="text-xs text-[#B3261E]">
          Reset
        </button>
      )}
    </div>
  );

  return (
    <FounderShell title="🔐 Share Permissions" allowed={f.can("share_permissions")} loaded={f.loaded}>
      <div className="overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center px-3 py-2 text-xs font-bold text-[#6C87B0]">
          <span className="flex-1">Role</span>
          <span className="w-12 text-center">Pic</span>
          <span className="w-12 text-center">Voice</span>
          <span className="w-12 text-center">Video</span>
        </div>
        {ROLES.map(([k, label, icon]) => {
          const p = perms[k] || { picture: false, voice: false, video: false };
          return (
            <div key={k} className="flex items-center border-t border-[#EEF2F7] px-3 py-2 text-sm">
              <span className="flex-1">
                {icon} {label}
              </span>
              {(["picture", "voice", "video"] as const).map((field) => (
                <span key={field} className="flex w-12 justify-center">
                  <input type="checkbox" checked={p[field]} onChange={(e) => setPerm(k, { ...p, [field]: e.target.checked })} className="h-5 w-5" />
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {status && <p className="text-xs text-gray-500">{status}</p>}

      <p className="pt-2 text-lg font-extrabold">🖼️ Badge Images</p>
      {ROLES.map(([k, label, icon]) => (
        <ImageRow key={k} docId="badge_images" k={k} icon={icon} label={label} url={badges[k]} />
      ))}

      <p className="pt-2 text-lg font-extrabold">🎖️ Level Badges</p>
      {/* One tap: the miGlife badge set (public/level-badges) for every tier, for the app and the web. */}
      <button
        type="button"
        disabled={uploading === "pack"}
        onClick={async () => {
          setUploading("pack");
          setStatus("");
          try {
            for (const [name] of LEVEL_TIERS) {
              await ceoSetBadgeImage({ docId: "level_badge_images", key: name, url: `${LEVEL_BADGE_PACK_BASE}/${name.toLowerCase().replace(/\s+/g, "_")}.webp` });
            }
            setStatus("✅ The miGlife level badges are on for every tier.");
            await load();
          } catch (e: any) {
            setStatus(e?.message || "Could not set the badges.");
          } finally {
            setUploading(null);
          }
        }}
        className="w-full rounded-xl bg-gradient-to-r from-[#F5B731] to-[#E58A00] py-2.5 text-sm font-extrabold text-white shadow disabled:opacity-60"
      >
        {uploading === "pack" ? "Saving…" : "✨ Use the miGlife badge set for all tiers"}
      </button>
      {LEVEL_TIERS.map(([name, icon]) => (
        <ImageRow key={name} docId="level_badge_images" k={name} icon={icon} label={name} url={levelBadges[name]} />
      ))}
    </FounderShell>
  );
}
