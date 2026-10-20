"use client";

import { useMemo, useRef, useState } from "react";
import { ALL_COUNTRIES, POPULAR_COUNTRY_NAMES, countryFlag, countryInfoFor, searchCountries, type CountryInfo } from "../../lib/countries";

// 🌍 Country picker (same as the app's CountryPickerDialog): a smart search
// ("uae", "usa", "bd", "dubai" work; names that START with what you typed come
// first), ⭐ popular countries as big flag tiles, and an A–Z bar that jumps
// straight to a letter.

const POPULAR = POPULAR_COUNTRY_NAMES.map((n) => countryInfoFor(n)).filter((c): c is CountryInfo => !!c);
const LETTERS = Array.from(new Set(ALL_COUNTRIES.map((c) => c.name[0].toUpperCase()))).sort();

function Row({ c, selected, onPick }: { c: CountryInfo; selected: boolean; onPick: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(c.name)}
      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition ${
        selected ? "bg-[#1E63D6]/10" : "hover:bg-[#EEF3FB]"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3F7FD] text-[22px] leading-none">{countryFlag(c.iso)}</span>
      <span className={`min-w-0 flex-1 truncate text-[15px] ${selected ? "font-extrabold text-[#1E63D6]" : "font-semibold text-[#0B2A5B]"}`}>{c.name}</span>
      <span className="text-[11px] font-bold text-[#A3AFC2]">{c.iso}</span>
      {selected && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1E63D6] text-[11px] font-black text-white">✓</span>}
    </button>
  );
}

export function CountryPickerDialog({
  selected,
  onPick,
  onClose,
}: {
  selected: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const found = useMemo(() => searchCountries(q), [q]);
  const listRef = useRef<HTMLDivElement>(null);
  const picked = countryInfoFor(selected);

  const jump = (letter: string) => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
    if (box && el) box.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0B2A5B]/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:h-[min(680px,90vh)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] px-4 pb-4 pt-3 text-white">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/40 sm:hidden" />
          <div className="flex items-center gap-2">
            <span className="text-[22px]">🌍</span>
            <p className="flex-1 text-lg font-extrabold">Select your country</p>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 shadow-md">
            <span className="text-[15px]">🔍</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 40))}
              placeholder="Type a name — e.g. ban, uae, usa"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#0B2A5B] caret-[#1E63D6] outline-none placeholder:font-normal placeholder:text-[#8A97B2]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF3FB] text-xs text-[#5B6B8C]">
                ✕
              </button>
            )}
          </div>
          {picked && (
            <p className="mt-2 text-xs font-semibold text-white/90">
              ✓ Selected: {countryFlag(picked.iso)} {picked.name}
            </p>
          )}
        </div>

        {/* A–Z jump bar */}
        {!q && (
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-[#E3ECF7] px-3 py-2">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => jump(l)}
                className="h-7 w-7 shrink-0 rounded-lg bg-[#EEF3FB] text-xs font-extrabold text-[#1E63D6] active:bg-[#1E63D6] active:text-white"
              >
                {l}
              </button>
            ))}
          </div>
        )}

        <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          {!q && (
            <>
              <p className="px-1.5 pb-2 pt-3 text-[11px] font-extrabold tracking-[1.2px] text-[#5B6B8C]">⭐ POPULAR</p>
              <div className="grid grid-cols-3 gap-2">
                {POPULAR.map((c) => (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => onPick(c.name)}
                    className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition ${
                      c.name === selected ? "border-[#1E63D6] bg-[#1E63D6]/10" : "border-[#E3ECF7] bg-[#F7FAFE] hover:bg-[#EEF3FB]"
                    }`}
                  >
                    <span className="text-[26px] leading-none">{countryFlag(c.iso)}</span>
                    <span className="w-full truncate text-center text-[11.5px] font-bold text-[#0B2A5B]">{c.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {q && <p className="px-1.5 pb-1 pt-3 text-[11px] font-extrabold tracking-[1.2px] text-[#5B6B8C]">{found.length} FOUND</p>}
          {found.map((c, i) => {
            const letter = c.name[0].toUpperCase();
            const header = !q && (i === 0 || found[i - 1].name[0].toUpperCase() !== letter);
            return (
              <div key={c.iso}>
                {header && (
                  <p data-letter={letter} className="px-1.5 pb-1 pt-3 text-xs font-black text-[#1E63D6]">
                    {letter}
                  </p>
                )}
                <Row c={c} selected={c.name === selected} onPick={onPick} />
              </div>
            );
          })}
          {found.length === 0 && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="text-4xl">🔎</span>
              <p className="mt-2 text-sm font-bold text-[#0B2A5B]">No country found</p>
              <p className="text-xs text-[#5B6B8C]">Try fewer letters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
