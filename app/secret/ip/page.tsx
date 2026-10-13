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

type GroupIp = { ip?: string; place?: string; isp?: string; at?: number | null };
type Group = {
  kind: "device" | "ip";
  key: string;
  keys?: string[];
  label: string;
  ip?: string;
  accounts: { uid: string; name: string; suspended: boolean; normalIp?: GroupIp | null; vpnIp?: GroupIp | null; ipCount?: number }[];
  lastSeenAt?: number | null;
  banned?: boolean;
  samePhone?: boolean;
  shared?: boolean;
};

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
  // 👥 Same Device (tab 4) / Same IP (tab 5): phones / IPs used by 2+ accounts
  const [sameDevice, setSameDevice] = useState<Group[] | null>(null);
  const [sameIp, setSameIp] = useState<Group[] | null>(null);
  const [groupQuery, setGroupQuery] = useState("");
  const [groupMin, setGroupMin] = useState(2);
  const [groupOpen, setGroupOpen] = useState<string | null>(null);
  const [groupBan, setGroupBan] = useState<{ g: Group; reason: string; all: boolean } | null>(null);

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
  const fetchGroups = async (kind: "device" | "ip") => {
    const list = ((await ipAdmin({ action: "groups", kind })).data.groups || []) as Group[];
    if (kind === "ip") setSameIp(list);
    else setSameDevice(list);
  };

  useEffect(() => {
    if (!f.can("ip_monitor")) return;
    if (tab === 1) task(fetchRecent);
    if (tab === 2) task(fetchBans);
    if (tab === 3) task(fetchDeviceBans);
    if (tab === 4 && sameDevice === null) task(() => fetchGroups("device"));
    if (tab === 5 && sameIp === null) task(() => fetchGroups("ip"));
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
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {(
          [
            [0, "User"],
            [4, "📱 Same Device"],
            [5, "🌐 Same IP"],
            [1, "Recent"],
            [2, "IP Bans"],
            [3, "Devices"],
          ] as [number, string][]
        ).map(([i, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={`min-w-[76px] shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold ${tab === i ? "bg-[#0B1F3A] text-white" : "bg-[#F1F5FB]"}`}
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
                    await ipAdmin({ action: "suspend", username: user.name, suspended: next, reason: "Suspended by MIGlife" });
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

      {(tab === 4 || tab === 5) &&
        (() => {
          const isIp = tab === 5;
          const list = (isIp ? sameIp : sameDevice) || [];
          const q = groupQuery.trim().toLowerCase();
          const shown = list.filter(
            (g) =>
              g.accounts.length >= groupMin &&
              (!q || g.label.toLowerCase().includes(q) || g.accounts.some((a) => a.name.toLowerCase().includes(q)))
          );
          return (
            <>
              <div className={`${card} space-y-2`}>
                <p className="text-sm font-bold">
                  {isIp ? "🌐 Same IP — accounts that signed in from one IP" : "📱 Same Device — accounts opened on one phone"}
                </p>
                <p className="text-xs text-gray-500">
                  {isIp
                    ? "Weaker sign: mobile data & Wi-Fi IPs are shared by many people. 📱 Same phone too = strong."
                    : "Strong sign — works through VPN, new SIM or other Wi-Fi. Tap a card for each account's normal IP & VPN IP."}
                </p>
                <input value={groupQuery} onChange={(e) => setGroupQuery(e.target.value.slice(0, 40))} placeholder={isIp ? "Search name or IP" : "Search name or phone"} className={input} />
                <div className="flex items-center gap-1.5">
                  {[2, 3, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setGroupMin(n)}
                      className={`rounded-full px-3 py-[7px] text-xs font-semibold ${groupMin === n ? "bg-[#0B1F3A] text-white" : "bg-[#F1F5FB]"}`}
                    >
                      {n}+ accounts
                    </button>
                  ))}
                  <button type="button" onClick={() => task(() => fetchGroups(isIp ? "ip" : "device"))} className="ml-auto px-2 text-lg text-[#2F80ED]">
                    ↻
                  </button>
                </div>
                <p className="text-xs font-semibold">
                  {shown.length} group(s) · {shown.reduce((n, g) => n + g.accounts.length, 0)} accounts
                </p>
              </div>
              {shown.length === 0 && !busy && (
                <p className="text-sm text-gray-500">{list.length === 0 ? `No shared ${isIp ? "IPs" : "phones"} found 🎉` : "Nothing matches."}</p>
              )}
              {shown.map((g) => {
                const strong = !isIp || g.samePhone;
                const open = groupOpen === g.key;
                const accent = g.banned ? "#9E9E9E" : strong ? "#E65100" : g.shared ? "#607D8B" : "#1565C0";
                const vpnUsers = g.accounts.filter((a) => a.vpnIp).length;
                const susp = g.accounts.filter((a) => a.suspended).length;
                const tag = (t: string, c: string) => (
                  <span key={t} className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-bold" style={{ color: c, background: `${c}1F` }}>
                    {t}
                  </span>
                );
                const ipLine = (icon: string, label: string, m: GroupIp | null | undefined, color: string) => (
                  <div className="flex items-start text-xs">
                    <span className="w-[22px] text-[13px]">{icon}</span>
                    {!m?.ip ? (
                      <span className="text-gray-500">{label}: —</span>
                    ) : (
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold" style={{ color }}>
                          {label}: {m.ip}
                        </span>
                        <span className="block text-[11px] text-gray-500">
                          {[m.place, m.isp].filter(Boolean).join(" · ")}
                          {m.place || m.isp ? "  •  " : ""}
                          {timeText(m.at ?? null)}
                        </span>
                      </span>
                    )}
                  </div>
                );
                return (
                  <div key={g.key} className="space-y-1.5 rounded-2xl border-[1.5px] bg-white p-3" style={{ borderColor: `${accent}${open ? "E6" : "66"}` }}>
                    <button type="button" onClick={() => setGroupOpen(open ? null : g.key)} className="flex w-full items-center text-left">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xl" style={{ background: `${accent}24` }}>
                        {isIp ? "🌐" : "📱"}
                      </span>
                      <span className="ml-2.5 min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{g.label}</span>
                        <span className="block text-[11px] text-gray-500">🕒 {timeText(g.lastSeenAt ?? null)}</span>
                      </span>
                      <span className="rounded-full px-2.5 py-1 text-[13px] font-black text-white" style={{ background: accent }}>
                        👥 {g.accounts.length}
                      </span>
                    </button>
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                      {g.banned && tag("⛔ BANNED", "#D32F2F")}
                      {!isIp && tag("🔒 Strong · same phone", "#E65100")}
                      {isIp && g.samePhone && tag("📱 Same phone too", "#E65100")}
                      {isIp && g.shared && tag("📶 Shared network?", "#607D8B")}
                      {isIp && !g.shared && !g.samePhone && tag("Same IP only", "#1565C0")}
                      {!isIp && vpnUsers > 0 && tag(`🛡️ VPN · ${vpnUsers}`, "#6A1B9A")}
                      {susp > 0 && tag(`🚫 ${susp} suspended`, "#D32F2F")}
                    </div>
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                      {g.accounts.map((a) => (
                        <button
                          key={a.uid}
                          type="button"
                          onClick={() => {
                            setTab(0);
                            setSearchName(a.name);
                            task(() => fetchUser(a.name));
                          }}
                          className={`shrink-0 rounded-full bg-[#F1F5FB] px-2.5 py-1.5 text-[13px] font-semibold ${a.suspended ? "text-[#D32F2F]" : ""}`}
                        >
                          {a.suspended ? "🚫 " : ""}
                          {a.name}
                        </button>
                      ))}
                    </div>
                    {!isIp &&
                      (!open ? (
                        <button type="button" onClick={() => setGroupOpen(g.key)} className="text-xs font-semibold" style={{ color: accent }}>
                          ▼ Normal IP & VPN IP of each account
                        </button>
                      ) : (
                        <div className="space-y-2">
                          {g.accounts.map((a) => (
                            <div key={a.uid} className="space-y-1 rounded-xl bg-[#0B1F3A0A] p-2.5">
                              <div className="flex items-center">
                                <span className="flex-1 text-sm font-bold">{a.name}</span>
                                {a.suspended && <span className="text-[10px] font-black text-[#D32F2F]">SUSPENDED</span>}
                              </div>
                              {ipLine("🌐", "Normal IP", a.normalIp, "#0B1F3A")}
                              {ipLine("🛡️", "VPN IP", a.vpnIp, "#6A1B9A")}
                              {(a.ipCount || 0) > 2 && <p className="text-[11px] text-gray-500">…and {(a.ipCount || 0) - 2} more IPs — tap the name for all</p>}
                            </div>
                          ))}
                        </div>
                      ))}
                    <div className="flex gap-3 text-sm font-semibold">
                      {isIp ? (
                        g.banned ? (
                          <button
                            type="button"
                            onClick={() =>
                              task(async () => {
                                await ipAdmin({ action: "unban", ip: g.ip });
                                await fetchGroups("ip");
                                setStatus(`✅ ${g.ip} unbanned`);
                              })
                            }
                            className="text-[#2E7D32]"
                          >
                            ✅ Unban IP
                          </button>
                        ) : (
                          <button type="button" onClick={() => setBanIp({ ip: g.ip || "", reason: "", all: false })} className="text-[#D32F2F]">
                            ⛔ Ban IP
                          </button>
                        )
                      ) : g.banned ? (
                        <button
                          type="button"
                          onClick={() =>
                            task(async () => {
                              await ipAdmin({ action: "unbanDevice", key: g.key });
                              await fetchGroups("device");
                              setStatus("✅ Device unbanned");
                            })
                          }
                          className="text-[#2E7D32]"
                        >
                          ✅ Unban phone
                        </button>
                      ) : (
                        <button type="button" onClick={() => setGroupBan({ g, reason: "", all: false })} className="text-[#D32F2F]">
                          ⛔ Ban this phone
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

      {groupBan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setGroupBan(null)}>
          <div className="w-full max-w-md space-y-2.5 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Ban this phone?</p>
            <p className="whitespace-pre-line text-[13px]">
              📱 {groupBan.g.label}
              {"\n"}Accounts: {groupBan.g.accounts.map((a) => a.name).join(", ")}
              {"\n"}No account can be used on this phone any more — with any IP, VPN or new ID.
            </p>
            <input value={groupBan.reason} onChange={(e) => setGroupBan({ ...groupBan, reason: e.target.value.slice(0, 200) })} placeholder="Reason (user will see it)" className={input} />
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={groupBan.all} onChange={(e) => setGroupBan({ ...groupBan, all: e.target.checked })} />
              Also suspend all {groupBan.g.accounts.length} accounts
            </label>
            <div className="flex justify-end gap-3 font-bold">
              <button type="button" onClick={() => setGroupBan(null)} className="text-[#2F80ED]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { g, reason, all } = groupBan;
                  setGroupBan(null);
                  task(async () => {
                    const keys = g.keys || [g.key];
                    const { data } = await ipAdmin({ action: "banDevice", key: keys[0] || "", keys, reason, suspendAccounts: all });
                    await fetchGroups("device");
                    setStatus("✅ Phone banned" + (all ? ` • ${Number(data.suspendedCount || 0)} account(s) suspended` : ""));
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
                    if (tab === 5) await fetchGroups("ip");
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
