"use client";

import { useIsClassic } from "../../lib/uiStyle";

// 👤 The /whois popup, like the app's: photo with a status dot, name, status /
// level / role chips, country, gender, joined date and the rooms they are in.
// The founder (staffView from the whoisUser Cloud Function) also sees coins,
// last active, invisible mode and accounts on the same phone.

export type WhoisInfo = Record<string, unknown>;

const STATUS: Record<string, [string, string]> = {
  AWAY: ["Away", "#F2A93B"],
  BUSY: ["Busy", "#E5484D"],
  OFFLINE: ["Offline", "#9AA3B2"],
  INVISIBLE: ["Offline", "#9AA3B2"],
};

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF3FA] text-base">{icon}</span>
      <span className="w-24 shrink-0 text-sm text-[#7A8599]">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#14213D]">{value}</span>
    </div>
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span className="rounded-full bg-white/[0.92] px-[9px] py-[3px] text-[11px] font-bold" style={{ color: `color-mix(in srgb, ${color} 65%, #14213D)` }}>
      {text}
    </span>
  );
}

export function WhoisPopup({ info, onClose }: { info: WhoisInfo; onClose: () => void }) {
  const classic = useIsClassic();
  const name = String(info.username || "");
  const level = Number(info.level) || 1;
  const status = String(info.status || "ONLINE").toUpperCase();
  const [statusText, statusColor] = STATUS[status] || ["Online", "#2FBF71"];
  const roleRaw = String(info.role || "user").replace(/_/g, " ");
  const role = roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1);
  const rooms = Array.isArray(info.rooms) ? info.rooms.filter((r): r is string => typeof r === "string") : [];
  const staff = info.staffView === true;
  const photo = typeof info.photoUrl === "string" ? info.photoUrl : "";
  const statusMessage = typeof info.statusMessage === "string" ? info.statusMessage.trim() : "";
  const joined = Number(info.joinedAt) || 0;
  const lastActive = Number(info.lastActiveAt) || 0;
  const same = Array.isArray(info.sameDevice) ? info.sameDevice.filter((s): s is string => typeof s === "string") : [];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex flex-col items-center py-[18px] text-white"
          style={{ background: classic ? "linear-gradient(180deg, #5A8FD6, #2F6ABD)" : "linear-gradient(135deg, #1FA2B8, #3B7BF0, #6A4BD8)" }}
        >
          <span className="relative">
            <span className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#33466E] text-3xl font-bold">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                name.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white" style={{ background: statusColor }} />
          </span>
          <p className="mt-2 text-xl font-extrabold" data-notranslate>
            {name}
          </p>
          <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
            <Chip text={`● ${statusText}`} color={statusColor} />
            <Chip text={`⭐ Level ${level}`} color="#F2B53A" />
            <Chip text={role} color="#8FB8FF" />
          </div>
        </div>

        <div className="space-y-2 px-4 py-3">
          {statusMessage && <p className="text-[13px] italic text-[#5B6478]">“{statusMessage}”</p>}
          <Row icon="🌍" label="Country" value={String(info.country || "")} />
          <Row icon="👤" label="Gender" value={String(info.gender || "")} />
          {joined > 0 && <Row icon="📅" label="Joined" value={fmtDate(joined)} />}

          <p className="pt-1 text-xs font-bold text-[#5B6478]">📍 In rooms</p>
          {rooms.length === 0 ? (
            <p className="text-[13px] text-[#9AA3B2]">Not in any room now</p>
          ) : (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {rooms.map((r) => (
                <span key={r} className="shrink-0 rounded-full bg-[#E6F3FB] px-2.5 py-1 text-xs font-semibold text-[#17507A]">
                  {r}
                </span>
              ))}
            </div>
          )}

          {staff && (
            <div className="space-y-1.5 rounded-2xl border border-[#F6D1D1] bg-[#FFF3F3] p-3">
              <p className="text-xs font-extrabold text-[#B71C1C]">🔒 Founder only</p>
              <Row icon="🪙" label="Coins" value={(Number(info.balance) || 0).toLocaleString("en-US")} />
              {lastActive > 0 && <Row icon="🕒" label="Last active" value={fmtTime(lastActive)} />}
              {info.invisible === true && <Row icon="👻" label="Mode" value="Invisible" />}
              <Row icon="📱" label="Same phone" value={same.length ? same.join(", ") : "—"} />
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full rounded-[14px] bg-gradient-to-r from-[#3B7BF0] to-[#6A4BD8] py-[11px] text-sm font-bold text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
