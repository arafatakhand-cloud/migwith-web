// 🔒 Security headers on every page:
//  • nobody can show miGlife inside their own site (a hidden frame that tricks
//    people into clicking — "clickjacking"),
//  • the browser never guesses file types, links to other sites don't carry
//    the page address, and the site is HTTPS-only,
//  • the camera / location are off; the microphone only for miGlife itself
//    (voice messages).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // 📍 geolocation=(self): the Feed's 🎯 "Use my current location" needs it (it was "()" = blocked for everyone, so GPS never worked)
  { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(self), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
