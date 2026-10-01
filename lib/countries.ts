// 🌍 EVERY COUNTRY — for Create ID / Edit Profile / founder "create ID", the
// same list as the app's Countries.kt. (OFFICIAL_COUNTRY_ROOMS in rooms.ts is
// something else: the official ROOMS list — it must not be changed by this.)

export type CountryInfo = { name: string; iso: string };

const LIST: [string, string][] = [
  ["Afghanistan", "AF"], ["Albania", "AL"], ["Algeria", "DZ"], ["Andorra", "AD"], ["Angola", "AO"],
  ["Antigua and Barbuda", "AG"], ["Argentina", "AR"], ["Armenia", "AM"], ["Australia", "AU"], ["Austria", "AT"],
  ["Azerbaijan", "AZ"], ["Bahamas", "BS"], ["Bahrain", "BH"], ["Bangladesh", "BD"], ["Barbados", "BB"],
  ["Belarus", "BY"], ["Belgium", "BE"], ["Belize", "BZ"], ["Benin", "BJ"], ["Bhutan", "BT"],
  ["Bolivia", "BO"], ["Bosnia and Herzegovina", "BA"], ["Botswana", "BW"], ["Brazil", "BR"], ["Brunei", "BN"],
  ["Bulgaria", "BG"], ["Burkina Faso", "BF"], ["Burundi", "BI"], ["Cambodia", "KH"], ["Cameroon", "CM"],
  ["Canada", "CA"], ["Cape Verde", "CV"], ["Central African Republic", "CF"], ["Chad", "TD"], ["Chile", "CL"],
  ["China", "CN"], ["Colombia", "CO"], ["Comoros", "KM"], ["Congo", "CG"], ["Congo (DR)", "CD"],
  ["Costa Rica", "CR"], ["Côte d'Ivoire", "CI"], ["Croatia", "HR"], ["Cuba", "CU"], ["Cyprus", "CY"],
  ["Czechia", "CZ"], ["Denmark", "DK"], ["Djibouti", "DJ"], ["Dominica", "DM"], ["Dominican Republic", "DO"],
  ["Ecuador", "EC"], ["Egypt", "EG"], ["El Salvador", "SV"], ["Equatorial Guinea", "GQ"], ["Eritrea", "ER"],
  ["Estonia", "EE"], ["Eswatini", "SZ"], ["Ethiopia", "ET"], ["Fiji", "FJ"], ["Finland", "FI"],
  ["France", "FR"], ["Gabon", "GA"], ["Gambia", "GM"], ["Georgia", "GE"], ["Germany", "DE"],
  ["Ghana", "GH"], ["Greece", "GR"], ["Grenada", "GD"], ["Guatemala", "GT"], ["Guinea", "GN"],
  ["Guinea-Bissau", "GW"], ["Guyana", "GY"], ["Haiti", "HT"], ["Honduras", "HN"], ["Hong Kong", "HK"],
  ["Hungary", "HU"], ["Iceland", "IS"], ["India", "IN"], ["Indonesia", "ID"], ["Iran", "IR"],
  ["Iraq", "IQ"], ["Ireland", "IE"], ["Israel", "IL"], ["Italy", "IT"], ["Jamaica", "JM"],
  ["Japan", "JP"], ["Jordan", "JO"], ["Kazakhstan", "KZ"], ["Kenya", "KE"], ["Kiribati", "KI"],
  ["Kosovo", "XK"], ["Kuwait", "KW"], ["Kyrgyzstan", "KG"], ["Laos", "LA"], ["Latvia", "LV"],
  ["Lebanon", "LB"], ["Lesotho", "LS"], ["Liberia", "LR"], ["Libya", "LY"], ["Liechtenstein", "LI"],
  ["Lithuania", "LT"], ["Luxembourg", "LU"], ["Macau", "MO"], ["Madagascar", "MG"], ["Malawi", "MW"],
  ["Malaysia", "MY"], ["Maldives", "MV"], ["Mali", "ML"], ["Malta", "MT"], ["Marshall Islands", "MH"],
  ["Mauritania", "MR"], ["Mauritius", "MU"], ["Mexico", "MX"], ["Micronesia", "FM"], ["Moldova", "MD"],
  ["Monaco", "MC"], ["Mongolia", "MN"], ["Montenegro", "ME"], ["Morocco", "MA"], ["Mozambique", "MZ"],
  ["Myanmar", "MM"], ["Namibia", "NA"], ["Nauru", "NR"], ["Nepal", "NP"], ["Netherlands", "NL"],
  ["New Zealand", "NZ"], ["Nicaragua", "NI"], ["Niger", "NE"], ["Nigeria", "NG"], ["North Korea", "KP"],
  ["North Macedonia", "MK"], ["Norway", "NO"], ["Oman", "OM"], ["Pakistan", "PK"], ["Palau", "PW"],
  ["Palestine", "PS"], ["Panama", "PA"], ["Papua New Guinea", "PG"], ["Paraguay", "PY"], ["Peru", "PE"],
  ["Philippines", "PH"], ["Poland", "PL"], ["Portugal", "PT"], ["Puerto Rico", "PR"], ["Qatar", "QA"],
  ["Romania", "RO"], ["Russia", "RU"], ["Rwanda", "RW"], ["Saint Kitts and Nevis", "KN"], ["Saint Lucia", "LC"],
  ["Saint Vincent and the Grenadines", "VC"], ["Samoa", "WS"], ["San Marino", "SM"], ["São Tomé and Príncipe", "ST"], ["Saudi Arabia", "SA"],
  ["Senegal", "SN"], ["Serbia", "RS"], ["Seychelles", "SC"], ["Sierra Leone", "SL"], ["Singapore", "SG"],
  ["Slovakia", "SK"], ["Slovenia", "SI"], ["Solomon Islands", "SB"], ["Somalia", "SO"], ["South Africa", "ZA"],
  ["South Korea", "KR"], ["South Sudan", "SS"], ["Spain", "ES"], ["Sri Lanka", "LK"], ["Sudan", "SD"],
  ["Suriname", "SR"], ["Sweden", "SE"], ["Switzerland", "CH"], ["Syria", "SY"], ["Taiwan", "TW"],
  ["Tajikistan", "TJ"], ["Tanzania", "TZ"], ["Thailand", "TH"], ["Timor-Leste", "TL"], ["Togo", "TG"],
  ["Tonga", "TO"], ["Trinidad and Tobago", "TT"], ["Tunisia", "TN"], ["Turkey", "TR"], ["Turkmenistan", "TM"],
  ["Tuvalu", "TV"], ["Uganda", "UG"], ["Ukraine", "UA"], ["United Arab Emirates", "AE"], ["United Kingdom", "GB"],
  ["United States", "US"], ["Uruguay", "UY"], ["Uzbekistan", "UZ"], ["Vanuatu", "VU"], ["Vatican City", "VA"],
  ["Venezuela", "VE"], ["Vietnam", "VN"], ["Yemen", "YE"], ["Zambia", "ZM"], ["Zimbabwe", "ZW"],
];

export const ALL_COUNTRIES: CountryInfo[] = LIST.map(([name, iso]) => ({ name, iso }));
export const ALL_COUNTRY_NAMES = ALL_COUNTRIES.map((c) => c.name);

/** Shown first, the countries most miglife people come from. */
export const POPULAR_COUNTRY_NAMES = [
  "Bangladesh", "India", "Pakistan", "Nepal", "Saudi Arabia", "United Arab Emirates",
  "Qatar", "Kuwait", "Oman", "Malaysia", "Singapore", "Maldives",
];

/** "BD" -> 🇧🇩 */
export function countryFlag(iso: string): string {
  if (iso.length !== 2) return "🏳️";
  const up = iso.toUpperCase();
  return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65);
}

export function countryInfoFor(name: string): CountryInfo | undefined {
  const n = name.trim().toLowerCase();
  return ALL_COUNTRIES.find((c) => c.name.toLowerCase() === n);
}

export function countryWithFlag(name: string): string {
  const c = countryInfoFor(name);
  return c ? `${countryFlag(c.iso)}  ${c.name}` : name;
}
