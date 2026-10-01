"use client";

import { useState } from "react";
import { ALL_COUNTRIES, POPULAR_COUNTRY_NAMES, countryFlag, countryInfoFor, type CountryInfo } from "../../lib/countries";

// 🌍 Searchable list of every country with flags (dark, gold accents), like
// the app's CountryPickerDialog: ⭐ POPULAR first, then 🌐 ALL COUNTRIES.

const POPULAR = POPULAR_COUNTRY_NAMES.map((n) => countryInfoFor(n)).filter((c): c is CountryInfo => !!c);

function Row({ c, selected, onPick }: { c: CountryInfo; selected: boolean; onPick: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(c.name)}
      className={`my-0.5 flex w-full items-center gap-3 rounded-[14px] px-3 py-[11px] text-left hover:bg-white/5 ${selected ? "bg-[#FFC84A]/20" : ""}`}
    >
      <span className="text-[22px] leading-none">{countryFlag(c.iso)}</span>
      <span className={`min-w-0 flex-1 truncate text-[15px] ${selected ? "font-bold text-[#FFD66B]" : "text-white"}`}>{c.name}</span>
      {selected && <span className="font-extrabold text-[#FFC84A]">✓</span>}
    </button>
  );
}

const Section = ({ t }: { t: string }) => (
  <p className="pb-1.5 pl-1.5 pt-2.5 text-[11px] font-bold tracking-[1.4px] text-[#FFD66B]">{t}</p>
);

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
  const q = query.trim().toLowerCase();
  const filtered = q ? ALL_COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q) : ALL_COUNTRIES;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(620px,90vh)] w-full max-w-md flex-col rounded-[26px] p-4 text-white"
        style={{ border: "1.5px solid transparent", background: "linear-gradient(#141C33, #0B1022) padding-box, linear-gradient(135deg, #FFC84A, #9C5BFF) border-box" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-[22px]">🌍</span>
          <p className="flex-1 text-lg font-extrabold">Select your country</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-lg text-[#9EA9C0]">
            ✕
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-[#34405E] bg-[#1C2643] px-3.5 py-3">
          <span className="text-[15px]">🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 40))}
            placeholder={`Search ${ALL_COUNTRIES.length} countries…`}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white caret-[#FFC84A] outline-none placeholder:text-[#7D88A3]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="text-sm text-[#9EA9C0]">
              ✕
            </button>
          )}
        </div>
        <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto">
          {!q && (
            <>
              <Section t="⭐ POPULAR" />
              {POPULAR.map((c) => (
                <Row key={`p_${c.iso}`} c={c} selected={c.name === selected} onPick={onPick} />
              ))}
              <Section t="🌐 ALL COUNTRIES" />
            </>
          )}
          {filtered.map((c) => (
            <Row key={`a_${c.iso}`} c={c} selected={c.name === selected} onPick={onPick} />
          ))}
          {filtered.length === 0 && <p className="p-5 text-sm text-[#9EA9C0]">No country found</p>}
        </div>
      </div>
    </div>
  );
}
