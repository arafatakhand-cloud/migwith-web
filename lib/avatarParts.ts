// 🧍 miGlife avatar — picture layers (all 512 × 1024, same canvas) stacked on
// top of each other: body → pants → hoodie → shoes. The pictures live in
// /public/avatar. The item list (id → slot, price) must match the server's
// AVATAR_ITEMS in functions/index.js and the app's AvatarSystem.kt.
export type AvatarSlotKey = "skin" | "top" | "bottom" | "shoes";
export type AvatarItem = { id: string; slot: AvatarSlotKey; name: string; price: number; src?: string };
export type AvatarLook = Record<AvatarSlotKey, string>;

export const AVATAR_SLOTS: { key: AvatarSlotKey; label: string }[] = [
  { key: "skin", label: "Skin" },
  { key: "top", label: "Hoodie" },
  { key: "bottom", label: "Pants" },
  { key: "shoes", label: "Shoes" },
];

const skin = (id: string, name: string): AvatarItem => ({ id, slot: "skin", name, price: 0, src: `/avatar/body/${id}.webp` });
const part = (slot: AvatarSlotKey, folder: string, n: number, name: string, price: number): AvatarItem => {
  const id = `${folder}_${String(n).padStart(2, "0")}`;
  return { id, slot, name, price, src: `/avatar/${slot}/${id}.webp` };
};

export const AVATAR_ITEMS: AvatarItem[] = [
  skin("skin_light", "Light"),
  skin("skin_base", "Fair"),
  skin("skin_tan", "Tan"),
  skin("skin_dark", "Dark"),

  { id: "top_none", slot: "top", name: "None", price: 0 },
  part("top", "hoodie", 3, "Blue Hoodie", 0),
  part("top", "hoodie", 7, "Grey Hoodie", 0),
  part("top", "hoodie", 2, "Red Hoodie", 8000),
  part("top", "hoodie", 4, "Green Hoodie", 8000),
  part("top", "hoodie", 8, "Charcoal Hoodie", 10000),
  part("top", "hoodie", 5, "Purple Hoodie", 12000),
  part("top", "hoodie", 6, "Orange Hoodie", 12000),

  { id: "bottom_none", slot: "bottom", name: "Shorts", price: 0 },
  part("bottom", "pant", 1, "Black Cargo", 0),
  part("bottom", "pant", 4, "Navy Cargo", 0),
  part("bottom", "pant", 3, "Charcoal Cargo", 4000),
  part("bottom", "pant", 7, "Grey Cargo", 4000),
  part("bottom", "pant", 2, "Olive Cargo", 5000),
  part("bottom", "pant", 5, "Brown Cargo", 5000),
  part("bottom", "pant", 6, "Midnight Cargo", 6000),
  part("bottom", "pant", 8, "Maroon Cargo", 6000),

  { id: "shoes_none", slot: "shoes", name: "Socks", price: 0 },
  part("shoes", "shoes", 1, "White Sneakers", 0),
  part("shoes", "shoes", 2, "Black Sneakers", 0),
  part("shoes", "shoes", 8, "Grey Sneakers", 3000),
  part("shoes", "shoes", 3, "Red Sneakers", 4000),
  part("shoes", "shoes", 4, "Blue Sneakers", 4000),
  part("shoes", "shoes", 5, "Green Sneakers", 4000),
  part("shoes", "shoes", 6, "Orange Sneakers", 5000),
  part("shoes", "shoes", 7, "Purple Sneakers", 5000),
];

export const AVATAR_DEFAULT: AvatarLook = { skin: "skin_light", top: "hoodie_03", bottom: "pant_04", shoes: "shoes_01" };

const BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));
export const avatarItem = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/** A saved look with every slot filled (unknown / missing ids → the default). */
export function fullLook(look: Partial<Record<string, string>> | null | undefined): AvatarLook {
  const out = { ...AVATAR_DEFAULT };
  for (const s of AVATAR_SLOTS) {
    const it = avatarItem(look?.[s.key]);
    if (it && it.slot === s.key) out[s.key] = it.id;
  }
  return out;
}

/** The pictures to stack, bottom first. Under a hoodie the body's shoulder is trimmed so it never pokes out. */
export function avatarLayers(look: AvatarLook): string[] {
  const top = avatarItem(look.top)?.src;
  const body = `/avatar/body/${look.skin}${top ? "_top" : ""}.webp`;
  return [body, avatarItem(look.bottom)?.src, top, avatarItem(look.shoes)?.src].filter((s): s is string => !!s);
}

export const avatarThumb = (it: AvatarItem) => `/avatar/thumbs/${it.id}.webp`;
