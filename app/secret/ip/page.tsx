"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { timeText, useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 🌐 IP Monitor (founder tool), like the app: a user's IPs and phones,
// recent sign-ins, IP bans and device bans — all through ipAdmin.

const ipAdmin = httpsCallable<Record<string, unknown>, Record<string, any>>(functions, "ipAdmin");

type IpRow = { username: string; ip: string; place: string; isp: string; device: string; lastSeenAt: number | null; count: number; banned: boolean; vpn: boolean };
type DevRow = { key: string; device: string; lastIp: string; vpnSeen: boolean; lastSeenAt: number | null; count: number; usernames: string[]; banned: boolean; banReason: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);
function ipRow(m: any): IpRow {
  const place =
    Array.from(new Set([m.city, m.region, m.country || m.countryCode].map(str).filter(Boolean))).join(", ") || str(m.countryCode) || "Unknown";
  return {
    username: str(m.username),
    ip: str(m.ip),
    place,
    isp: str(m.isp),
    device: str(m.device),
    lastSeenAt: numOrNull(m.lastSeenAt),
    count: Number(m.count || 0),
    banned: m.banned === true,
    vpn: m.vpn === true,
  };
}
function devRow(m: any): DevRow {
  return {
    key: str(m.key),
    device: str(m.device),
    lastIp: str(m.lastIp),
    vpnSeen: m.vpnSeen === true,
    lastSeenAt: numOrNull(m.lastSeenAt),
    count: Number(m.count || 0),
    usernames: Array.isArray(m.usernames) ? m.usernames.map(String) : [],
    banned: m.banned === true,
    banReason: str(m.banReason),
  };
}

const Vpn = () => <span className="rounded-md bg-[#6A1B9A] px-1.5 py-0.5 text-[11px] font-bold text-white">🛡️ VPN</span>;
const Banned = () => <span className="text-xs font-bold text-[#D32F2F]">BANNED</span>;

export default function IpMonitorPage() {
  const f = useFounderPerms();
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [searchName, setSearchName] = useState("");
  const [user, setUser] = useState<{ name: string; suspended: boolean; reason: string; latest: IpRow | null; ips: IpRow[]; devices: DevRow[] } | null>(null);
  const [recent, setRecent] = useState<IpRow[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [deviceBans, setDeviceBans] = useState<any[]>([]);
  const [manualIp, setManualIp] = useState("");
  const [ipUsersText, setIpUsersText] = useState("");
  const [banIp, setBanIp] = useState<{ ip: string; reason: string; all: boolean } | null>(null);
  const [banDev, setBanDev] = useState<{ dev: DevRow; reason: string; all: boolean } | null>(null);

  const task = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Failed"));
    } finally {
      setBusy(false);
    }
  };
  const fetchUser = async (name: string) => {
    const { data: r } = await ipAdmin({ action: "user", username: name.trim() });
    const latest = r.latest ? ipRow(r.latest) : null;
    setUser({
      name: str(r.username),
      suspended: r.suspended === true,
      reason: str(r.suspendReason),
      latest,
      ips: (Array.isArray(r.ips) ? r.ips : []).map(ipRow),
      devices: (Array.isArray(r.devices) ? r.devices : []).map(devRow),
    });
    if (!latest) setStatus("This user hasn't opened the new app version yet — no IP recorded.");
  };
  const fetchRecent = async () => setRecent(((await ipAdmin({ action: "recent" })).data.items || []).map(ipRow));
  const fetchBans = async () => setBans((await ipAdmin({ action: "bans" })).data.items || []);
  const fetchDeviceBans = async () => setDeviceBans((await ipAdmin({ action: "deviceBans" })).data.items || []);

  useEffect(() => {
    if (!f.can("ip_monitor")) return;
    if (tab === 1) task(fetchRecent);
    if (tab === 2) task(fetchBans);
    if (tab === 3) task(fetchDeviceBans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, f.loaded]);

  const IpCard = ({ row, showUser, onClick }: { row: IpRow; showUser: boolean; onClick?: () => void }) => (
    <div className={`${card} space-y-0.5 ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      {showUser && <p className="text-[15px] font-bold">{row.username}</p>}
      <div className="flex items-center gap-1.5">
        <span className="flex-1 font-semibold">🌐 {row.ip}</span>
        {row.vpn && <Vpn />}
        {row.banned && <Banned />}
      </div>
      <p className="text-[13px] text-gray-500">📍 {row.place}</p>
      {row.isp && <p className="text-[13px] text-gray-500">📶 {row.isp}</p>}
      {row.device && <p className="text-[13px] text-gray-500">📱 {row.device}</p>}
      <p className="text-xs text-gray-500">
        🕒 {timeText(row.lastSeenAt)}
        {row.count > 0 ? `  •  used ${row.count}x` : ""}
      </p>
      {!showUser && !row.banned && row.ip && (
        <div className="flex gap-3 pt-1 text-sm font-semibold">
          <button type="button" onClick={() => setBanIp({ ip: row.ip, reason: "", all: false })} className="text-[#D32F2F]">
            ⛔ Ban this IP
          </button>
          <button
            type="button"
            onClick={() =>
              task(async () => {
                const { data } = await ipAdmin({ action: "ipUsers", ip: row.ip });
                setIpUsersText(`Accounts on ${row.ip}: ` + ((data.usernames || []).join(", ") || "none"));
              })
            }
            className="text-[#2F80ED]"
          >
            👥 Who else?
          </button>
        </div>
      )}
    </div>
  );

  const DevCard = ({ dev }: { dev: DevRow }) => {
    const others = dev.usernames.filter((u) => u.toLowerCase() !== (user?.name || "").toLowerCase());
    return (
      <div className={`space-y-0.5 rounded-2xl p-3 shadow-sm ${others.length ? "bg-[#FFF3E0]" : "bg-white"}`}>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 font-bold">📱 {dev.device || "Unknown phone"}</span>
          {dev.vpnSeen && <Vpn />}
          {dev.banned && <Banned />}
        </div>
        {others.length === 0 ? (
          <p className="text-[13px] text-[#2E7D32]">✅ Only this account on this phone</p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-[#E65100]">⚠️ Same phone — {others.length} other account(s):</p>
            <p className="text-sm">{others.join(", ")}</p>
          </>
        )}
        {dev.lastIp && <p className="text-xs text-gray-500">🌐 Last IP: {dev.lastIp}</p>}
        <p className="text-xs text-gray-500">
          🕒 {timeText(dev.lastSeenAt)}
          {dev.count > 0 ? `  •  opened ${dev.count}x` : ""}
        </p>
        {dev.banned && dev.banReason && <p className="text-xs text-gray-500">Reason: {dev.banReason}</p>}
        <div className="pt-1 text-sm font-semibold">
          {dev.banned ? (
            <button
              type="button"
              onClick={() =>
                task(async () => {
                  await ipAdmin({ action: "unbanDevice", key: dev.key });
                  if (user) await fetchUser(user.name);
                  setStatus("✅ Device unbanned");
                })
              }
              className="text-[#2E7D32]"
            >
              ✅ Unban device
            </button>
          ) : (
            <button type="button" onClick={() => setBanDev({ dev, reason: "", all: false })} className="text-[#D32F2F]">
              ⛔ Ban this device
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <FounderShell title="🌐 IP Monitor" allowed={f.can("ip_monitor")} loaded={f.loaded}>
      <div className="grid grid-cols-4 gap-1.5">
        {["User", "Recent", "IP Bans", "Devices"].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={`rounded-xl py-2.5 text-sm font-semibold ${tab === i ? "bg-[#0B1F3A] text-white" : "bg-[#F1F5FB]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {busy && <div className="h-1 animate-pulse rounded bg-[#2F80ED]/60" />}
      {status && <p className="text-[13px] text-gray-500">{status}</p>}
      {ipUsersText && <p className="text-[13px]">{ipUsersText}</p>}

      {tab === 0 && (
        <>
          <div className="flex gap-2">
            <input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Username" className={input} />
            <button
              type="button"
              disabled={busy || !searchName.trim()}
              onClick={() => task(() => fetchUser(searchName))}
              className="rounded-full bg-[#2F80ED] px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              Search
            </button>
          </div>
          {user?.name && (
            <>
              <div className="flex items-center">
                <p className="flex-1 text-lg font-bold">{user.name}</p>
                {user.suspended && <span className="font-bold text-[#D32F2F]">SUSPENDED</span>}
              </div>
              {user.suspended && user.reason && <p className="text-[13px] text-gray-500">Reason: {user.reason}</p>}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  task(async () => {
                    const next = !user.suspended;
                    await ipAdmin({ action: "suspend", username: user.name, suspended: next, reason: "Suspended by migwith" });
                    await fetchUser(user.name);
                    setStatus(next ? `✅ ${user.name} suspended` : `✅ ${user.name} unsuspended`);
                  })
                }
                className={`w-full rounded-full py-2.5 font-bold text-white ${user.suspended ? "bg-[#2E7D32]" : "bg-[#D32F2F]"}`}
              >
                {user.suspended ? "✅ Unsuspend account" : "🚫 Suspend account"}
              </button>
              {user.devices.length > 0 ? (
                <>
                  <p className="font-bold">📱 Same Device ({user.devices.length} phone)</p>
                  <p className="text-xs text-gray-500">Works even with VPN — shows every account ever opened on the same phone.</p>
                  {user.devices.map((d) => (
                    <DevCard key={d.key} dev={d} />
                  ))}
                </>
              ) : (
                user.latest && <p className="text-xs text-gray-500">📱 No device info yet — shows after this user opens the new app version.</p>
              )}
              {user.latest && (
                <>
                  <p className="font-bold">Current / last IP</p>
                  <IpCard row={{ ...user.latest, banned: user.ips.some((r) => r.ip === user.latest?.ip && r.banned) }} showUser={false} />
                </>
              )}
              {user.ips.length > 1 && (
                <>
                  <p className="font-bold">All IPs used ({user.ips.length})</p>
                  {user.ips.map((r, i) => (
                    <IpCard key={`${r.ip}${i}`} row={r} showUser={false} />
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {tab === 1 && (
        <>
          <button type="button" onClick={() => task(fetchRecent)} className="text-sm font-bold text-[#2F80ED]">
            ↻ Refresh
          </button>
          {recent.length === 0 && !busy && <p className="text-gray-500">No sign-ins recorded yet.</p>}
          {recent.map((r, i) => (
            <IpCard
              key={`${r.username}${r.ip}${i}`}
              row={r}
              showUser
              onClick={() => {
                setTab(0);
                setSearchName(r.username);
                task(() => fetchUser(r.username));
              }}
            />
          ))}
        </>
      )}

      {tab === 2 && (
        <>
          <p className="font-bold">Ban an IP manually</p>
          <div className="flex gap-2">
            <input value={manualIp} onChange={(e) => setManualIp(e.target.value.trim())} placeholder="IP address" className={input} />
            <button
              type="button"
              onClick={() => manualIp && setBanIp({ ip: manualIp, reason: "", all: false })}
              className="rounded-full bg-[#D32F2F] px-4 text-sm font-bold text-white"
            >
              Ban
            </button>
          </div>
          {bans.length === 0 && !busy && <p className="text-gray-500">No banned IPs.</p>}
          {bans.map((b) => (
            <div key={str(b.ip)} className={`${card} flex items-center`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold">⛔ {str(b.ip)}</p>
                {str(b.reason) && <p className="text-[13px] text-gray-500">{str(b.reason)}</p>}
                <p className="text-xs text-gray-500">{timeText(numOrNull(b.bannedAt))}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  task(async () => {
                    await ipAdmin({ action: "unban", ip: str(b.ip) });
                    await fetchBans();
                    setStatus(`✅ ${str(b.ip)} unbanned`);
                  })
                }
                className="text-sm font-bold text-[#2F80ED]"
              >
                Unban
              </button>
            </div>
          ))}
        </>
      )}

      {tab === 3 && (
        <>
          <button type="button" onClick={() => task(fetchDeviceBans)} className="text-sm font-bold text-[#2F80ED]">
            ↻ Refresh
          </button>
          {deviceBans.length === 0 && !busy && <p className="text-gray-500">No banned devices.</p>}
          {deviceBans.map((b) => (
            <div key={str(b.key)} className={`${card} flex items-center`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold">⛔ 📱 {str(b.device) || "Unknown phone"}</p>
                {Array.isArray(b.usernames) && b.usernames.length > 0 && <p className="text-[13px]">Accounts: {b.usernames.join(", ")}</p>}
                {str(b.reason) && <p className="text-[13px] text-gray-500">{str(b.reason)}</p>}
                <p className="text-xs text-gray-500">{timeText(numOrNull(b.bannedAt))}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  task(async () => {
                    await ipAdmin({ action: "unbanDevice", key: str(b.key) });
                    await fetchDeviceBans();
                    setStatus("✅ Device unbanned");
                  })
                }
                className="text-sm font-bold text-[#2F80ED]"
              >
                Unban
              </button>
            </div>
          ))}
        </>
      )}

      {banDev && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setBanDev(null)}>
          <div className="w-full max-w-md space-y-2.5 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Ban this phone?</p>
            <p className="whitespace-pre-line text-[13px]">
              📱 {banDev.dev.device || "Unknown phone"}
              {"\n"}No account can be used on this phone any more — with any IP, VPN or new ID.
            </p>
            <input value={banDev.reason} onChange={(e) => setBanDev({ ...banDev, reason: e.target.value.slice(0, 200) })} placeholder="Reason (user will see it)" className={input} />
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={banDev.all} onChange={(e) => setBanDev({ ...banDev, all: e.target.checked })} />
              Also suspend every account used on this phone ({banDev.dev.usernames.length})
            </label>
            <div className="flex justify-end gap-3 font-bold">
              <button type="button" onClick={() => setBanDev(null)} className="text-[#2F80ED]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { dev, reason, all } = banDev;
                  setBanDev(null);
                  task(async () => {
                    const { data } = await ipAdmin({ action: "banDevice", username: user?.name || "", key: dev.key, reason, suspendAccounts: all });
                    if (user) await fetchUser(user.name);
                    setStatus("✅ Device banned" + (all ? ` • ${Number(data.suspendedCount || 0)} account(s) suspended` : ""));
                  });
                }}
                className="text-[#D32F2F]"
              >
                Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {banIp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setBanIp(null)}>
          <div className="w-full max-w-md space-y-2.5 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Ban IP {banIp.ip}?</p>
            <input value={banIp.reason} onChange={(e) => setBanIp({ ...banIp, reason: e.target.value.slice(0, 200) })} placeholder="Reason (user will see it)" className={input} />
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={banIp.all} onChange={(e) => setBanIp({ ...banIp, all: e.target.checked })} />
              Also suspend every account that used this IP
            </label>
            <p className="text-xs text-gray-500">
              Note: mobile data IPs are often shared by many people and change when data is turned off/on. Suspending the account is more reliable than an IP ban.
            </p>
            <div className="flex justify-end gap-3 font-bold">
              <button type="button" onClick={() => setBanIp(null)} className="text-[#2F80ED]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { ip, reason, all } = banIp;
                  setBanIp(null);
                  task(async () => {
                    const { data } = await ipAdmin({ action: "ban", ip, reason, suspendAccounts: all });
                    if (user?.name) await fetchUser(user.name);
                    if (tab === 2) await fetchBans();
                    setStatus(`✅ ${ip} banned` + (all ? ` • ${Number(data.suspendedCount || 0)} account(s) suspended` : ""));
                  });
                }}
                className="text-[#D32F2F]"
              >
                Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </FounderShell>
  );
}
