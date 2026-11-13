// 📍 Places for the Feed's "Where are you?" picker: Bangladesh's divisions,
// districts and well-known spots, then big cities abroad. [name, sub, icon]
export type Place = { name: string; sub: string; icon: string };

const BD = "Bangladesh";
const SPOTS: [string, string, string][] = [
  ["Cox's Bazar", BD, "🌊"],
  ["Saint Martin's Island", "Cox's Bazar", "🏝️"],
  ["Sajek Valley", "Rangamati", "⛰️"],
  ["Sylhet Tea Gardens", "Sylhet", "🍃"],
  ["Sundarbans", "Khulna", "🐅"],
  ["Kuakata", "Patuakhali", "🌅"],
  ["Bandarban", BD, "⛰️"],
  ["Ratargul Swamp Forest", "Sylhet", "🌳"],
  ["Jaflong", "Sylhet", "🏞️"],
  ["Hatirjheel", "Dhaka", "🌉"],
  ["Dhanmondi Lake", "Dhaka", "🌳"],
  ["Gulshan", "Dhaka", "🏙️"],
  ["Dhanmondi", "Dhaka", "📍"],
  ["Mirpur", "Dhaka", "📍"],
  ["Uttara", "Dhaka", "📍"],
  ["Bashundhara", "Dhaka", "📍"],
  ["Old Dhaka", "Dhaka", "🕌"],
  ["University of Dhaka", "Dhaka", "🎓"],
  ["Shahbagh", "Dhaka", "📍"],
  ["Motijheel", "Dhaka", "📍"],
  ["Padma Bridge", BD, "🌉"],
  ["Hazrat Shahjalal Airport", "Dhaka", "✈️"],
  ["Patenga Beach", "Chattogram", "🌊"],
  ["Foy's Lake", "Chattogram", "🏞️"],
  ["Mahasthangarh", "Bogura", "🏛️"],
  ["Paharpur", "Naogaon", "🏛️"],
];
const DISTRICTS = [
  "Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Mymensingh",
  "Gazipur", "Narayanganj", "Cumilla", "Bogura", "Jessore", "Dinajpur", "Tangail", "Faridpur",
  "Noakhali", "Feni", "Brahmanbaria", "Chandpur", "Lakshmipur", "Rangamati", "Khagrachhari", "Bandarban",
  "Moulvibazar", "Habiganj", "Sunamganj", "Kishoreganj", "Netrokona", "Jamalpur", "Sherpur", "Narsingdi",
  "Manikganj", "Munshiganj", "Madaripur", "Shariatpur", "Gopalganj", "Rajbari", "Pabna", "Sirajganj",
  "Natore", "Naogaon", "Chapainawabganj", "Joypurhat", "Kushtia", "Meherpur", "Chuadanga", "Jhenaidah",
  "Magura", "Narail", "Satkhira", "Bagerhat", "Patuakhali", "Bhola", "Pirojpur", "Jhalokati", "Barguna",
  "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Thakurgaon", "Panchagarh",
];
const WORLD: [string, string][] = [
  ["Kolkata", "India"], ["Delhi", "India"], ["Mumbai", "India"], ["Dubai", "United Arab Emirates"],
  ["Abu Dhabi", "United Arab Emirates"], ["Riyadh", "Saudi Arabia"], ["Makkah", "Saudi Arabia"], ["Madinah", "Saudi Arabia"],
  ["Doha", "Qatar"], ["Kuwait City", "Kuwait"], ["Muscat", "Oman"], ["Kuala Lumpur", "Malaysia"], ["Singapore", "Singapore"],
  ["Bangkok", "Thailand"], ["Tokyo", "Japan"], ["Seoul", "South Korea"], ["London", "United Kingdom"],
  ["New York", "United States"], ["Toronto", "Canada"], ["Sydney", "Australia"], ["Rome", "Italy"], ["Paris", "France"],
  ["Istanbul", "Türkiye"], ["Kathmandu", "Nepal"], ["Malé", "Maldives"],
];
export const PLACES: Place[] = [
  ...DISTRICTS.slice(0, 8).map((n) => ({ name: n, sub: BD, icon: "🏙️" })),
  ...SPOTS.map(([name, sub, icon]) => ({ name, sub, icon })),
  ...DISTRICTS.slice(8).map((n) => ({ name: n, sub: BD, icon: "📍" })),
  ...WORLD.map(([name, sub]) => ({ name, sub, icon: "🌍" })),
];
export function searchPlaces(q: string): Place[] {
  const t = q.trim().toLowerCase();
  if (!t) return PLACES.slice(0, 14);
  return PLACES.filter((p) => p.name.toLowerCase().includes(t) || p.sub.toLowerCase().includes(t))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(t)) - Number(a.name.toLowerCase().startsWith(t)))
    .slice(0, 20);
}
/** 🎯 my GPS spot → "Dhanmondi" + "Dhaka, Bangladesh" (OpenStreetMap; free, no key) */
export async function placeHere(): Promise<Place> {
  const ask = (o: PositionOptions) =>
    new Promise<GeolocationPosition>((ok, no) =>
      navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, no, o) : no(new Error("no gps"))
    );
  // quick Wi-Fi/network fix first; if that fails (not a "blocked"), try the real GPS for longer
  let pos: GeolocationPosition;
  try {
    pos = await ask({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  } catch (e) {
    if ((e as { code?: number })?.code === 1) throw e;
    pos = await ask({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  const { latitude, longitude } = pos.coords;
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`);
  const j = (await r.json()) as { address?: Record<string, string> };
  const a = j.address || {};
  const name = a.suburb || a.neighbourhood || a.quarter || a.village || a.town || a.city_district || a.city || a.county || a.state || "";
  const city = a.city || a.town || a.county || a.state_district || a.state || "";
  const sub = [city !== name ? city : "", a.country || ""].filter(Boolean).join(", ");
  if (!name) throw new Error("no place");
  return { name: name.slice(0, 60), sub: sub.slice(0, 80), icon: "📍" };
}
