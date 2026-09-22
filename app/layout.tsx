import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomie — Your shared home, sorted",
  description: "A roommate app concept for chores, shared expenses, space bookings, and house agreements. Fictional demo household.",
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
