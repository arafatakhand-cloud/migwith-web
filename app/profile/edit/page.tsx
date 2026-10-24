"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { PageShell } from "../../_components/PageShell";
import { PhotoCropDialog } from "../../_components/PhotoCropDialog";
import { CountryPickerDialog } from "../../_components/CountryPicker";
import { countryFlag, countryInfoFor } from "../../../lib/countries";
import { useIsClassic } from "../../_components/Classic";
import { getProfileDetails, saveProfileDetails } from "../../../lib/blocks";

// Same fields and storage paths as the app's EditProfilePage (MainActivity.kt).

const RELATIONSHIPS = ["Single", "In a Relationship", "Married", "Divorced", "Widowed", "Prefer not to say"];
const GENDERS: [string, string][] = [
  ["Male", "♂ Male"],
  ["Female", "♀ Female"],
  ["Others", "♙ Others"],
];
// Nobody may look like the founder or staff through their Full Name.
const RESERVED = new Set(["migwith", "miglife", "admin", "ceo", "staff", "owner", "support", "mod", "moderator", "superadmin"]);
const nameKey = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
// 🖼 Ready-made covers (public/covers). Saved as a full https link, so the app
// (and older app versions) show them like any uploaded cover.
const COVER_BASE = "https://web.miglife.app/covers";
const READY_COVERS = ["aurora", "sunset", "mint", "night", "gold", "berry"];
const BIO_MAX = 200;

export default function EditProfilePage() {
  const router = useRouter();
  const classic = useIsClassic();
  const { user, username, loading } = useCurrentUser();

  const [loaded, setLoaded] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [gender, setGender] = useState("Male");
  const [relationship, setRelationship] = useState("Single");
  const [photoUrl, setPhotoUrl] = useState("");
  const [coverPhotoUrl, setCoverPhotoUrl] = useState("");
  const [uploading, setUploading] = useState("");
  // A picked profile photo opens the crop editor first (like the app).
  const [cropFile, setCropFile] = useState<File | null>(null);
  // The cover gets the same editor with a wide frame (3.2 : 1, like the app).
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  // 🖼 the "Change cover" sheet: camera / gallery / ready-made / remove
  const [coverSheet, setCoverSheet] = useState(false);
  const [pickedCover, setPickedCover] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !username) return;
    // 🔒 the details are in profile_details/{uid} now (an account not moved
    // yet still has them on users/{uid})
    Promise.all([getDoc(doc(db, "users", user.uid)), getProfileDetails(user.uid)])
      .then(([snap, det]) => {
        const x = snap.data() || {};
        const pick = (k: keyof typeof det) => det[k] || String(x[k] || "").trim();
        setFullName(pick("fullName") || username);
        setDateOfBirth(pick("dateOfBirth"));
        setBio(pick("bio"));
        setCountry(String(x.country || "").trim());
        if (x.gender) setGender(String(x.gender));
        if (pick("relationship")) setRelationship(pick("relationship"));
        setPhotoUrl(String(x.photoUrl || x.profilePic || x.avatarUrl || x.imageUrl || "").trim());
        setCoverPhotoUrl(pick("coverPhotoUrl"));
        setLoaded(true);
      })
      .catch(() => setError("Could not load your profile."));
  }, [user, username]);

  const upload = async (kind: "photo" | "cover", file: Blob | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The image must be smaller than 10 MB.");
      return;
    }
    setUploading(kind);
    setError("");
    try {
      const path = kind === "photo" ? `profile_pictures/${user.uid}.jpg` : `cover_pictures/${user.uid}.jpg`;
      const r = ref(storage, path);
      await uploadBytes(r, file, { contentType: file.type });
      const url = await getDownloadURL(r);
      if (kind === "photo") await setDoc(doc(db, "users", user.uid), { photoUrl: url }, { merge: true });
      else await saveProfileDetails(user.uid, username, { coverPhotoUrl: url });
      if (kind === "photo") setPhotoUrl(url);
      else setCoverPhotoUrl(url);
    } catch (err) {
      console.error(err);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading("");
    }
  };

  // A ready-made cover, or "" to take the cover away.
  const setCoverLink = async (url: string) => {
    if (!user) return;
    setUploading("cover");
    setError("");
    try {
      await saveProfileDetails(user.uid, username, { coverPhotoUrl: url });
      // an account not moved yet may still keep an old cover on users/{uid}
      if (!url) await setDoc(doc(db, "users", user.uid), { coverPhotoUrl: "" }, { merge: true }).catch(() => {});
      setCoverPhotoUrl(url);
      setCoverSheet(false);
    } catch (err) {
      console.error(err);
      setError("Could not change the cover. Please try again.");
    } finally {
      setUploading("");
    }
  };

  const save = async () => {
    if (!user) return;
    const cleanName = fullName.trim() || username;
    if (RESERVED.has(nameKey(cleanName)) && nameKey(cleanName) !== nameKey(username)) {
      setError("This name is reserved. Please choose a different Full Name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await Promise.all([
        setDoc(doc(db, "users", user.uid), { country: country.trim(), gender }, { merge: true }),
        // 🔒 private details: profile_details/{uid}
        saveProfileDetails(user.uid, username, {
          fullName: cleanName,
          dateOfBirth: dateOfBirth.trim(),
          bio: bio.trim(),
          relationship,
        }),
      ]);
      leave();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not save profile.");
      setSaving(false);
    }
  };

  // ‹ and Save go BACK to the page that opened Edit Profile (the profile), like
  // the app. Opening the profile as a new page instead made a loop: the
  // profile's ‹ went back to Edit Profile, whose ‹ opened the profile again …
  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.replace(`/profile/${encodeURIComponent(username || "me")}`);
  };

  if (!loading && !user) {
    return (
      <PageShell light>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <Link href="/login" className="rounded-xl bg-[#2F80ED] px-6 py-3 font-bold text-white">
            Login
          </Link>
        </div>
      </PageShell>
    );
  }

  const field = "w-full rounded-xl border border-[#D5E3F5] bg-white px-4 py-3 text-[#0B2A5B] outline-none focus:border-[#2F80ED]";

  const pickCoverFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Please choose an image.");
    setCoverSheet(false);
    setCoverCropFile(f);
  };
  const inField = "flex min-h-[48px] w-full items-center gap-2.5 rounded-2xl border-[1.5px] border-white/95 bg-white/85 px-3.5 text-[15px] text-[#0B2A5B] shadow-[0_2px_8px_rgba(40,80,140,.08)] focus-within:border-[#3B7BF0]";
  const icon = (bg: string, e: string) => (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-[15px]" style={{ background: bg }}>
      {e}
    </span>
  );
  const lbl = "mb-1.5 ml-1 text-[11.5px] font-extrabold tracking-[.3px] text-[#5B6B8C]";

  const dialogs = (
    <>
      {countryOpen && (
        <CountryPickerDialog
          selected={country}
          onPick={(n) => {
            setCountry(n);
            setCountryOpen(false);
          }}
          onClose={() => setCountryOpen(false)}
        />
      )}
      {cropFile && (
        <PhotoCropDialog
          file={cropFile}
          frameAspect={1}
          round
          outWidth={560}
          hint="Drag to move · pinch or scroll to zoom · the circle is your profile photo"
          onCancel={() => setCropFile(null)}
          onCropped={(jpeg) => {
            setCropFile(null);
            upload("photo", jpeg);
          }}
        />
      )}
      {coverCropFile && (
        <PhotoCropDialog
          file={coverCropFile}
          frameAspect={3.2}
          round={false}
          outWidth={1280}
          hint="Drag to move · pinch or scroll to zoom · the frame is your cover photo"
          onCancel={() => setCoverCropFile(null)}
          onCropped={(jpeg) => {
            setCoverCropFile(null);
            upload("cover", jpeg);
          }}
        />
      )}
    </>
  );

  if (!classic) {
    return (
      <PageShell light pale>
        <div className="mx-auto max-w-xl pb-28">
          <div className="flex items-center gap-3 px-4 pt-4">
            <button type="button" onClick={leave} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white text-lg text-[#0B2A5B] shadow-sm">
              ←
            </button>
            <h1 className="text-2xl font-black text-[#0B2A5B]">Edit Profile</h1>
          </div>

          {!loaded ? (
            <p className="py-16 text-center text-[#5B6B8C]">{error || "Loading…"}</p>
          ) : (
            <>
              {/* 👀 live preview: exactly how others see the top of your profile */}
              <button
                type="button"
                onClick={() => {
                  setPickedCover("");
                  setCoverSheet(true);
                }}
                className="relative mt-3 block h-[170px] w-full overflow-hidden text-left [clip-path:ellipse(85%_100%_at_50%_0%)]"
              >
                {coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span
                    className="block h-full w-full"
                    style={{ background: "radial-gradient(35% 55% at 25% 30%, rgba(255,255,255,.45), transparent 70%), linear-gradient(120deg, #1565D8, #7B5CF0 60%, #FF7EB6)" }}
                  />
                )}
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-white bg-white/90 px-3 py-1.5 text-[12.5px] font-extrabold text-[#0B2A5B] shadow-md">
                  {uploading === "cover" ? "Uploading…" : "📷 Change cover"}
                </span>
              </button>

              <div className="relative -mt-[54px] flex items-end gap-3 px-4">
                <label className="relative block h-[112px] w-[112px] shrink-0 cursor-pointer rounded-full p-1" style={{ background: "conic-gradient(from 40deg, #F58529, #DD2A7B, #8134AF, #515BD4, #F58529)" }}>
                  <span className="block h-full w-full rounded-full bg-white p-[3px]">
                    <span className="relative block h-full w-full overflow-hidden rounded-full bg-[#E8EEF5]">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[42px] font-bold text-[#8FA3BF]">{username.slice(0, 1).toUpperCase()}</span>
                      )}
                      {uploading === "photo" && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white">Uploading…</span>}
                    </span>
                  </span>
                  <span className="absolute bottom-1 right-0 flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#1565D8] to-[#7B5CF0] text-[15px] shadow-[0_4px_10px_rgba(21,101,216,.45)]">
                    📷
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!!uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (!f.type.startsWith("image/")) return setError("Please choose an image.");
                      setCropFile(f);
                    }}
                  />
                </label>
                <div className="min-w-0 pb-2">
                  <p data-notranslate className="truncate text-[22px] font-black text-[#1E63D6]">{username}</p>
                  <p className="text-[12.5px] text-[#35507E]">This is how others see you</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 px-4">
                <div>
                  <p className={lbl}>MIG ID · CAN&apos;T BE CHANGED</p>
                  <p className={`${inField} !bg-white/45 text-[#7A8AA5]`}>
                    {icon("#EEF2F8", "🔒")}
                    <span data-notranslate>{username}</span>
                  </p>
                </div>
                <label className="block">
                  <p className={lbl}>FULL NAME</p>
                  <span className={inField}>
                    {icon("#E7F0FF", "👤")}
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={40} className="min-w-0 flex-1 bg-transparent py-3 outline-none" />
                  </span>
                </label>
                <label className="block">
                  <p className={lbl}>BIO</p>
                  <span className={`${inField} !items-start py-2.5`}>
                    {icon("#FFE8F1", "✍️")}
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                      maxLength={BIO_MAX}
                      rows={3}
                      placeholder="Say something about you…"
                      className="min-w-0 flex-1 resize-none bg-transparent pt-0.5 outline-none placeholder:text-[#9AA8BF]"
                    />
                    <span className="self-end text-[11px] text-[#9AA8BF]">
                      {bio.length}/{BIO_MAX}
                    </span>
                  </span>
                </label>
                <div>
                  <p className={lbl}>GENDER</p>
                  <div className="flex gap-1.5 rounded-2xl border-[1.5px] border-white bg-white/60 p-1">
                    {GENDERS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGender(value)}
                        className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold ${
                          gender === value ? "bg-gradient-to-br from-[#1565D8] to-[#7B5CF0] text-white shadow-[0_4px_10px_rgba(21,101,216,.35)]" : "text-[#35507E]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <p className={lbl}>BIRTHDAY</p>
                    <span className={inField}>
                      {icon("#FFF3D6", "🎂")}
                      <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-[14px] outline-none [color-scheme:light]" />
                    </span>
                  </label>
                  <div>
                    <p className={lbl}>COUNTRY</p>
                    <button type="button" onClick={() => setCountryOpen(true)} className={`${inField} text-left`}>
                      {icon("#E8F7EF", countryInfoFor(country) ? countryFlag(countryInfoFor(country)!.iso) : "🌍")}
                      <span className={`min-w-0 flex-1 truncate ${country ? "" : "text-[#8A9AB2]"}`}>{country || "Select"}</span>
                    </button>
                  </div>
                </div>
                <label className="block">
                  <p className={lbl}>RELATIONSHIP</p>
                  <span className={inField}>
                    {icon("#FDECEF", "💍")}
                    <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className="min-w-0 flex-1 bg-transparent py-3 outline-none">
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                {error && <p className="text-sm text-rose-600">{error}</p>}
              </div>

              {/* ✓ always in reach */}
              <div className="sticky bottom-0 z-20 mt-5 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !!uploading}
                  className="h-[50px] w-full rounded-full bg-gradient-to-r from-[#1565D8] via-[#3B7BF0] to-[#7B5CF0] text-[17px] font-black text-white shadow-[0_8px_20px_rgba(59,123,240,.4)] disabled:opacity-60"
                >
                  {saving ? "Saving…" : "✓ Save changes"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* 🖼 Change cover: camera · gallery · ready-made · remove */}
        {coverSheet && (
          <div className="fixed inset-0 z-50 flex items-end bg-[#0B1F3A]/35" onClick={() => setCoverSheet(false)}>
            <div
              className="mx-auto w-full max-w-xl rounded-t-[26px] border-t-[1.5px] border-white px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-2.5 shadow-[0_-8px_24px_rgba(11,31,58,.18)]"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,.97), rgba(244,248,255,.96))" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-[5px] w-11 rounded-full bg-[#C9D6E8]" />
              <p className="text-[17px] font-black text-[#0B2A5B]">🖼 Change cover</p>
              <p className="mt-0.5 text-[12.5px] text-[#5B6B8C]">Upload your own, or pick a ready-made one</p>
              <div className="mt-3 flex gap-2.5">
                <label className={`${inField} flex-1 cursor-pointer justify-center font-extrabold`}>
                  📷 Camera
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickCoverFile(f); }} />
                </label>
                <label className={`${inField} flex-1 cursor-pointer justify-center font-extrabold`}>
                  🖼 Gallery
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickCoverFile(f); }} />
                </label>
              </div>
              <p className={`${lbl} mt-3.5`}>READY-MADE COVERS</p>
              <div className="grid grid-cols-3 gap-2">
                {READY_COVERS.map((name) => {
                  const url = `${COVER_BASE}/${name}.jpg`;
                  const on = (pickedCover || coverPhotoUrl) === url;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPickedCover(url)}
                      className={`relative h-16 overflow-hidden rounded-[14px] border-[3px] ${on ? "border-[#1565D8]" : "border-transparent"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/covers/${name}.jpg`} alt="" className="h-full w-full object-cover" />
                      {on && <span className="absolute right-1 top-0.5 text-xs">✅</span>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3.5 flex gap-2.5">
                <button
                  type="button"
                  disabled={!coverPhotoUrl || !!uploading}
                  onClick={() => setCoverLink("")}
                  className={`${inField} flex-1 justify-center font-extrabold !text-[#E0303F] disabled:opacity-40`}
                >
                  🗑 Remove
                </button>
                <button
                  type="button"
                  disabled={!pickedCover || pickedCover === coverPhotoUrl || !!uploading}
                  onClick={() => setCoverLink(pickedCover)}
                  className="h-12 flex-[1.4] rounded-full bg-gradient-to-r from-[#1565D8] via-[#3B7BF0] to-[#7B5CF0] font-black text-white shadow-[0_6px_16px_rgba(59,123,240,.4)] disabled:opacity-50"
                >
                  {uploading === "cover" ? "Saving…" : "✓ Use this"}
                </button>
              </div>
            </div>
          </div>
        )}
        {dialogs}
      </PageShell>
    );
  }

  return (
    <PageShell light pale>
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {/* Classic: no blue "✎ Edit Profile" bar — the page tab already says
            "Edit Profile" (owner's choice). */}
        {classic ? null : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={leave} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white text-lg text-[#0B2A5B] shadow-sm">
            ←
          </button>
          <h1 className="text-2xl font-black text-[#0B2A5B]">Edit Profile</h1>
        </div>
        )}

        {!loaded ? (
          <p className="py-16 text-center text-[#5B6B8C]">{error || "Loading…"}</p>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Cover + photo exactly like the profile page: the same rainbow
                frame; the photo box (108 × 140) starts right at the cover's
                bottom border, joined to it. */}
            <label className="mig-frame relative block aspect-[3.2] cursor-pointer rounded-2xl">
              <div className="flex h-full items-center justify-center overflow-hidden rounded-[13px] bg-gradient-to-b from-[#174EA6] to-[#0B2A5B] text-white">
                {coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-black">MIG LIFE</span>
                )}
              </div>
              <span className="absolute bottom-2 right-2 rounded-[10px] bg-black/55 px-2.5 py-1 text-[13px] font-bold text-white">
                {uploading === "cover" ? "Uploading…" : "📷 Change cover"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (!f.type.startsWith("image/")) return setError("Please choose an image.");
                  setCoverCropFile(f);
                }}
              />
            </label>

            <div className="!mt-0 flex items-start gap-3">
              {/* round photo half on the cover's bottom edge, same as the profile */}
              <label className="mig-frame relative z-10 ml-2.5 -mt-[52px] block h-[112px] w-[112px] shrink-0 cursor-pointer rounded-full">
                <div className="relative h-full overflow-hidden rounded-full bg-[#E8EEF5]">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[42px] font-bold text-[#8FA3BF]">
                      {username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  {uploading === "photo" ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white">Uploading…</span>
                  ) : (
                    <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-xs font-bold text-white">📷</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!!uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (!f.type.startsWith("image/")) return setError("Please choose an image.");
                    setCropFile(f);
                  }}
                />
              </label>
              <div className="pt-3">
                <p className="text-[15px] font-bold text-[#0B2A5B]">Profile photo &amp; cover</p>
                <p className="mt-1 text-xs text-[#35507E]">
                  Tap the photo or the cover to change it. This is exactly how they look on your profile.
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">MIG ID (cannot be changed)</p>
              <p className="rounded-xl border border-[#D5E3F5] bg-[#EAF2FC] px-4 py-3 text-[#5B6B8C]">{username}</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Full Name</p>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={40} className={field} />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Bio</p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                className={`${field} resize-none`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Date of birth</p>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={`${field} [color-scheme:light]`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Gender</p>
              <div className="flex gap-2">
                {GENDERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGender(value)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-bold ${
                      gender === value ? "border-[#2F80ED] bg-[#2F80ED] text-white" : "border-[#D5E3F5] bg-white text-[#0B2A5B]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-bold text-[#35507E]">Country</p>
                {/* searchable list of every country, with flags (like the app) */}
                <button type="button" onClick={() => setCountryOpen(true)} className={`${field} flex items-center gap-2 text-left`}>
                  <span className="text-lg leading-none">{countryInfoFor(country) ? countryFlag(countryInfoFor(country)!.iso) : "🌍"}</span>
                  <span className={`min-w-0 flex-1 truncate ${country ? "" : "text-[#8A9AB2]"}`}>{country || "Select your country"}</span>
                  <span className="text-[#2F80ED]">▾</span>
                </button>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-[#35507E]">Relationship</p>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className={field}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
              type="button"
              onClick={save}
              disabled={saving || !!uploading}
              className="w-full rounded-2xl bg-[#0B2A5B] py-3.5 font-black text-white shadow disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
      {countryOpen && (
        <CountryPickerDialog
          selected={country}
          onPick={(n) => {
            setCountry(n);
            setCountryOpen(false);
          }}
          onClose={() => setCountryOpen(false)}
        />
      )}
      {cropFile && (
        <PhotoCropDialog
          file={cropFile}
          // Round, like the photo on the profile.
          frameAspect={1}
          round
          outWidth={560}
          hint="Drag to move · pinch or scroll to zoom · the circle is your profile photo"
          onCancel={() => setCropFile(null)}
          onCropped={(jpeg) => {
            setCropFile(null);
            upload("photo", jpeg);
          }}
        />
      )}
      {coverCropFile && (
        <PhotoCropDialog
          file={coverCropFile}
          frameAspect={3.2}
          round={false}
          outWidth={1280}
          hint="Drag to move · pinch or scroll to zoom · the frame is your cover photo"
          onCancel={() => setCoverCropFile(null)}
          onCropped={(jpeg) => {
            setCoverCropFile(null);
            upload("cover", jpeg);
          }}
        />
      )}
    </PageShell>
  );
}
