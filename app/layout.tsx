import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomie — Your shared home, sorted",
  description: "Create your household, invite roommates, and organize chores, shared expenses, reservations, and house agreements.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
