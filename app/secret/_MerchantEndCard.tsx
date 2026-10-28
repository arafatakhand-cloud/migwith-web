"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { input } from "./_Shell";

// 🧹 End a Merchant who became a Mentor: removes the Merchant links, tags and
// requests of that user (the same clean-up as making them a Mentor). Preview
// first — nothing is deleted until "Apply".

const endMerchantshipByName = httpsCallable<
  { username: string; apply?: boolean },
  { dryRun: boolean; username: string; count: number; paths: string[] }
>(functions, "endMerchantshipByName");

const OK = "#1E7A3C";
const BAD = "#E5484D";

export function EndMerchantCard() {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);

  const run = async (apply: boolean) => {
    const name = username.trim();
    if (!name) return;
    if (apply && !window.confirm(`@${name} এর Merchant সব record মুছে ফেলা হবে। নিশ্চিত?`)) return;
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const { data } = await endMerchantshipByName({ username: name, apply });
      setPaths(data.paths || []);
      setMsg(
        apply
          ? `✅ @${data.username}: ${data.count} record মুছে ফেলা হয়েছে।`
          : `🔍 @${data.username}: ${data.count} record মুছবে (এখনো কিছু মোছা হয়নি)।`
      );
    } catch (e: any) {
      setFailed(true);
      setPaths([]);
      setMsg(`Failed: ${e?.message || "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-[18px] border border-[#C2410C] bg-white p-4">
      <p className="text-[14px] font-bold">🧹 End Merchant (became a Mentor)</p>
      <p className="text-xs text-gray-500">
        আগে Preview চাপুন — কী কী মুছবে দেখাবে। Apply চাপলে তবেই মুছবে।
      </p>
      <input
        className={input}
        placeholder="username (যেমন oly)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !username.trim()}
          onClick={() => run(false)}
          className="flex-1 rounded-xl border border-[#C2410C] py-2.5 text-[14px] font-bold text-[#C2410C] disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy || !username.trim()}
          onClick={() => run(true)}
          className="flex-1 rounded-xl bg-[#C2410C] py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {msg && (
        <p className="text-[13px] font-semibold" style={{ color: failed ? BAD : OK }}>
          {msg}
        </p>
      )}
      {paths.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-gray-600">
          {paths.map((p) => (
            <li key={p} className="break-all">
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
