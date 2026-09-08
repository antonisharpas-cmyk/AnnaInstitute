import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/i18n";

export const metadata: Metadata = {
  title: "One Eleven. Sales and Client Management",
  description: "Buyers, contracts, payment schedules, agents and commissions.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
