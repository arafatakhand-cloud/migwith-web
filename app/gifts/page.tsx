"use client";

import { useEffect, useState } from "react";
import { loadGiftCatalog, type Gift } from "../_components/GiftPanel";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";

// Explore › Gift Shops: the gift catalog with prices. Gifts are sent from a chat room or a private chat.
export default function GiftShopsPage() {
  const ready = useRequireLogin();
  const [gifts, setGifts] = useState<Gift[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    loadGiftCatalog()
      .then(setGifts)
      .catch(() => setGifts([]));
  }, [ready]);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-8 sm:px-6">
        <PageTitle title="Gift Shops" subtitle="Coins · Special & Limited" icon="🎁" />
        <p className="mb-3 text-center text-xs text-[#5B6B8C]">Send a gift with the 🎁 button in a chat room or a private chat.</p>
        {gifts === null ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading gifts…</p>
        ) : gifts.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">No gifts right now.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {gifts.map((g) => (
              <li key={g.name} className="flex flex-col items-center rounded-2xl border border-[#E3ECF7] bg-white px-2 py-3 text-center shadow-sm">
                <span className="flex h-16 w-16 items-center justify-center text-4xl">
                  {g.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.imageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    g.icon
                  )}
                </span>
                <span data-notranslate className="mt-1 w-full truncate text-sm font-bold text-[#0B2A5B]">
                  {g.name}
                </span>
                <span className="mt-1 rounded-full bg-[#FFF3D6] px-2 text-xs font-bold text-[#B7791F]">🪙 {g.price}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
