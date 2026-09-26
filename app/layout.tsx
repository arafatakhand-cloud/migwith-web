import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MIGwith",
  description: "Connect with people, discover rooms, chat, share gifts and play games.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
