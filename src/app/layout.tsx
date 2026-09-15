import type { Metadata } from "next";
/*
  The interface face lives in the project itself, in public/fonts, and is
  declared at the top of globals.css. It is not fetched from anybody else and
  it is not pulled out of node_modules either, so a fresh copy of this folder
  builds with no extra install and nothing about who is using the CRM leaves
  the building.
*/
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
