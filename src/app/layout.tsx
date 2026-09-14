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
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/*
          Day or night, and how tight the rows sit, decided before the first
          pixel. Without this the page would draw itself light and roomy and
          then change a moment later, which is the thing everybody notices
          about a dark theme done badly.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("oe_theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;var d=localStorage.getItem("oe_density");if(d==="tight"||d==="roomy"){document.documentElement.dataset.density=d;}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
