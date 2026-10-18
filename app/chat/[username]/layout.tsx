// ⚡ Built once per name and then served from Vercel's cache (like the other
// pages), instead of being made again on a US server for every visit. The
// page itself is all in the browser (it reads the name from the address).
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
