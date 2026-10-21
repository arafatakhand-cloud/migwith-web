// 🏆 Round profile picture for the ranking pages (Luxury Festival, Gift
// Contest): the user's photo, or their first letter on a colour.

export function profileImageUrl(d: Record<string, unknown> | undefined): string {
  for (const key of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d?.[key] || "").trim();
    if (v) return v;
  }
  return "";
}

const COLORS = ["#6C4BC4", "#D9527F", "#C8871E", "#4A90E2", "#2FAE85", "#E0703C", "#3FA7C9"];

/** Round profile picture; no picture → the first letter on a colour. */
export function Face({ name, url, size, ring, glow }: { name: string; url?: string; size: number; ring?: string; /** colour of the glow around the picture (the #1) */ glow?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        padding: ring ? 3 : 2,
        background: ring || "rgba(255,255,255,.85)",
        boxShadow: glow ? `0 0 0 3px ${glow}55, 0 0 22px ${glow}88` : "0 2px 8px rgba(0,0,0,.3)",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-black text-white"
          style={{ backgroundColor: COLORS[h % COLORS.length], fontSize: size * 0.4 }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
