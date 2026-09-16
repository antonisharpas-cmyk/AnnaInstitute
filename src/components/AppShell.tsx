"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import CommandPalette, { type PaletteLabels } from "@/components/CommandPalette";
import {
  IconAlert,
  IconBell,
  IconClose,
  IconKeyboard,
  IconLogout,
  IconMenu,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconUp,
  SECTION_ICONS,
} from "@/components/icons";

/*
  Every link in the shell asks the server for its page only when it is used.
  Next prefetches links by default, which on a list of twenty rows means twenty
  extra renders of other pages the moment the list appears, and a browser busy
  with those occasionally drops the navigation somebody actually asked for.
*/
export type NavItem = { href: string; label: string; group: string; count?: number };
export type Alert = { label: string; href: string; count: number; tone: "bad" | "warn" };

export type ShellLabels = {
  subtitle: string;
  search: string;
  searchHint: string;
  nothing: string;
  goTo: string;
  create: string;
  groups: Record<string, string>;
  quickAdd: string;
  alerts: string;
  noAlerts: string;
  theme: string;
  themeDay: string;
  themeNight: string;
  density: string;
  densityRoomy: string;
  densityTight: string;
  language: string;
  signOut: string;
  shortcuts: string;
  shortcutsTitle: string;
  shortcutSearch: string;
  shortcutNew: string;
  shortcutTheme: string;
  shortcutHelp: string;
  shortcutClose: string;
  menu: string;
  collapse: string;
};

const THEME_KEY = "oe_theme";
const DENSITY_KEY = "oe_density";
const NAV_KEY = "oe_nav";

/** True when the keystroke belongs to whatever the person is typing in. */
function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}

/**
 * The frame every page sits in.
 *
 * Built for somebody who is in here all day: the section they are in is marked
 * with a bar rather than a colour wash, what needs attention is a number on the
 * bell, anything can be reached with Control K, and the whole thing turns dark
 * at the end of the afternoon. The sidebar narrows to icons and remembers that,
 * and on a telephone it slides in over the page.
 */
export default function AppShell({
  user,
  locale,
  items,
  alerts,
  creates,
  signOut,
  setLocale,
  undo,
  labels,
  children,
}: {
  user: { name: string; email: string };
  locale: string;
  items: NavItem[];
  alerts: Alert[];
  creates: { href: string; label: string }[];
  signOut: () => void | Promise<void>;
  setLocale: (formData: FormData) => void | Promise<void>;
  labels: ShellLabels;
  /** Offered while the last action can still be taken back. */
  undo?: { label: string; title: string; action: () => Promise<void> };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [density, setDensity] = useState<"roomy" | "tight">("roomy");
  const [narrow, setNarrow] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState<"add" | "alerts" | "user" | null>(null);
  const [help, setHelp] = useState(false);
  const shell = useRef<HTMLDivElement>(null);

  // What was chosen last time. The theme is also written on the document by a
  // small script in the page head, so there is no flash of the wrong one.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const preferred =
        saved === "dark" || saved === "light"
          ? saved
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      setTheme(preferred);
      document.documentElement.dataset.theme = preferred;
      setNarrow(localStorage.getItem(NAV_KEY) === "narrow");
      const rows = localStorage.getItem(DENSITY_KEY);
      if (rows === "tight" || rows === "roomy") {
        setDensity(rows);
        document.documentElement.dataset.density = rows;
      }
    } catch {
      // A browser with storage switched off simply starts light and wide.
    }
  }, []);

  const switchTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Not remembering it is better than failing to switch it.
      }
      return next;
    });
  }, []);

  /**
   * How much air the rows get.
   *
   * Somebody reading a long table all day wants more of it on the screen at
   * once; somebody entering figures wants room to aim at. It is written on the
   * document like the theme, so no component needs to know about it.
   */
  const switchDensity = useCallback((next: "roomy" | "tight") => {
    setDensity(next);
    document.documentElement.dataset.density = next;
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {
      // Not remembering it is better than failing to set it.
    }
  }, []);

  const switchWidth = useCallback(() => {
    setNarrow((current) => {
      const next = !current;
      try {
        localStorage.setItem(NAV_KEY, next ? "narrow" : "wide");
      } catch {
        // As above.
      }
      return next;
    });
  }, []);

  // The shortcuts. Nothing fires while somebody is typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
        return;
      }
      if (typing(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        setPalette(true);
      }
      if (event.key === "?") {
        event.preventDefault();
        setHelp((current) => !current);
      }
      if (event.key.toLowerCase() === "t" && !meta) {
        switchTheme();
      }
      if (event.key.toLowerCase() === "n" && !meta && creates[0]) {
        event.preventDefault();
        router.push(creates[0].href);
      }
      if (event.key === "Escape") {
        setMenu(null);
        setHelp(false);
        setDrawer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchTheme, creates, router]);

  // A click anywhere else closes whichever small menu is open.
  useEffect(() => {
    if (!menu) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-menu]")) setMenu(null);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [menu]);

  useEffect(() => {
    setDrawer(false);
    setMenu(null);
  }, [pathname]);

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const groups = [...new Set(items.map((item) => item.group))];
  const pressing = alerts.reduce((total, alert) => total + alert.count, 0);
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
      {groups.map((group) => (
        <div key={group}>
          {narrow ? (
            <div className="mx-2 my-2 border-t border-brand-line" />
          ) : (
            <p className="navgroup">{labels.groups[group] ?? group}</p>
          )}
          {items
            .filter((item) => item.group === group)
            .map((item) => {
              const Icon = SECTION_ICONS[item.href] ?? IconSearch;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={narrow ? item.label : undefined}
                  className={`navlink ${active(item.href) ? "navlink-active" : ""} ${
                    narrow ? "justify-center" : ""
                  }`}
                  prefetch={false}
                >
                  <Icon size={17} />
                  {narrow ? null : <span className="truncate">{item.label}</span>}
                  {!narrow && item.count ? <span className="navcount">{item.count}</span> : null}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );

  return (
    <div ref={shell} className="flex min-h-screen">
      {/* The sidebar, on anything wider than a telephone. */}
      <aside
        /* no-print: a statement sent to a buyer should not carry our menu. */
        className={`no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-brand-line bg-brand-paper py-4 md:flex ${
          narrow ? "w-[4.5rem]" : "w-60"
        }`}
      >
        <div className={`mb-3 flex items-center gap-2 ${narrow ? "justify-center px-2" : "px-4"}`}>
          {narrow ? (
            <Link href="/" aria-label="One Eleven" className="avatar" prefetch={false}>
              11
            </Link>
          ) : (
            <Link href="/" className="min-w-0" prefetch={false}>
              <Logo width={124} />
              <span className="mt-1 block truncate text-xs text-brand-graphite/70">
                {labels.subtitle}
              </span>
            </Link>
          )}
        </div>

        {nav}

        <div className={`mt-auto border-t border-brand-line pt-3 ${narrow ? "px-2" : "px-4"}`}>
          <button
            type="button"
            onClick={switchWidth}
            title={labels.collapse}
            className="iconbtn mx-auto"
            aria-label={labels.collapse}
          >
            <IconMenu size={17} />
          </button>
        </div>
      </aside>

      {/* On a telephone the same list slides in over the page. */}
      {drawer ? (
        <div className="scrim md:hidden" onClick={() => setDrawer(false)}>
          <div
            className="mr-auto flex h-full w-64 flex-col bg-brand-paper py-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-4">
              <Logo width={112} />
              <button
                type="button"
                className="iconbtn"
                onClick={() => setDrawer(false)}
                aria-label={labels.shortcutClose}
              >
                <IconClose size={18} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar no-print">
          <button
            type="button"
            className="iconbtn md:hidden"
            onClick={() => setDrawer(true)}
            aria-label={labels.menu}
          >
            <IconMenu size={19} />
          </button>

          <button type="button" className="searchbutton" onClick={() => setPalette(true)}>
            <IconSearch size={16} />
            <span className="flex-1 truncate">{labels.search}</span>
            <span className="kbd hidden sm:inline">Ctrl K</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {/* Make something new, without going looking for the button. */}
            <div className="relative" data-menu>
              <button
                type="button"
                className="iconbtn"
                aria-label={labels.quickAdd}
                title={labels.quickAdd}
                onClick={() => setMenu(menu === "add" ? null : "add")}
              >
                <IconPlus size={19} />
              </button>
              {menu === "add" ? (
                <div className="menu">
                  <p className="palette-group">{labels.create}</p>
                  {creates.map((create) => (
                    <Link
                      key={create.href}
                      href={create.href}
                      className="menuitem"
                      prefetch={false}
                    >
                      <IconPlus size={15} />
                      {create.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            {/*
              The way back from the last thing that was done.
              It stays here for two minutes, so somebody who has moved on to
              another screen can still take back a status change or a delete.
            */}
            {undo ? (
              <form action={undo.action}>
                <button type="submit" className="undochip" title={undo.title}>
                  <IconUp size={14} />
                  {undo.label}
                </button>
              </form>
            ) : null}

            {/* What needs attention, counted. */}
            <div className="relative" data-menu>
              <button
                type="button"
                className="iconbtn"
                aria-label={labels.alerts}
                title={labels.alerts}
                onClick={() => setMenu(menu === "alerts" ? null : "alerts")}
              >
                <IconBell size={19} />
                {pressing > 0 ? <span className="dot" /> : null}
              </button>
              {menu === "alerts" ? (
                <div className="menu">
                  <p className="palette-group">{labels.alerts}</p>
                  {alerts.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-brand-graphite/60">{labels.noAlerts}</p>
                  ) : (
                    alerts.map((alert) => (
                      <Link
                        key={alert.href + alert.label}
                        href={alert.href}
                        className="menuitem"
                        prefetch={false}
                      >
                        <IconAlert
                          size={15}
                          className={
                            alert.tone === "bad"
                              ? "text-[color:var(--color-negative)]"
                              : "text-[color:var(--color-warning)]"
                          }
                        />
                        <span className="flex-1">{alert.label}</span>
                        <span className="pill">{alert.count}</span>
                      </Link>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="iconbtn"
              onClick={switchTheme}
              aria-label={labels.theme}
              title={theme === "dark" ? labels.themeDay : labels.themeNight}
            >
              {theme === "dark" ? <IconSun size={19} /> : <IconMoon size={19} />}
            </button>

            {/* Who is signed in, and the way out. */}
            <div className="relative" data-menu>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-brand-teal-soft"
                onClick={() => setMenu(menu === "user" ? null : "user")}
                aria-label={user.name}
              >
                <span className="avatar">{initials || "?"}</span>
                <span className="hidden max-w-32 truncate text-sm md:block">{user.name}</span>
              </button>
              {menu === "user" ? (
                <div className="menu">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-brand-graphite/60">{user.email}</p>
                  </div>
                  <div className="my-1 border-t border-brand-line" />
                  <p className="palette-group">{labels.language}</p>
                  <div className="flex gap-1 px-2 pb-2">
                    {(["en", "el"] as const).map((code) => (
                      <form key={code} action={setLocale}>
                        <input type="hidden" name="locale" value={code} />
                        <button
                          type="submit"
                          className={`btn !px-3 !py-1 !text-xs ${
                            locale === code ? "btn-primary" : "btn-secondary"
                          }`}
                        >
                          {code === "en" ? "EN" : "ΕΛ"}
                        </button>
                      </form>
                    ))}
                  </div>
                  <div className="my-1 border-t border-brand-line" />
                  <p className="palette-group">{labels.density}</p>
                  <div className="flex gap-1 px-2 pb-2">
                    {(["roomy", "tight"] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => switchDensity(choice)}
                        className={`btn !px-3 !py-1 !text-xs ${
                          density === choice ? "btn-primary" : "btn-secondary"
                        }`}
                      >
                        {choice === "roomy" ? labels.densityRoomy : labels.densityTight}
                      </button>
                    ))}
                  </div>
                  <div className="my-1 border-t border-brand-line" />
                  <button type="button" className="menuitem" onClick={() => setHelp(true)}>
                    <IconKeyboard size={15} />
                    {labels.shortcuts}
                  </button>
                  <form action={signOut}>
                    <button type="submit" className="menuitem w-full">
                      <IconLogout size={15} />
                      {labels.signOut}
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[92rem] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        sections={items.map((item) => ({ href: item.href, label: item.label }))}
        creates={creates}
        labels={
          {
            placeholder: labels.search,
            hint: labels.searchHint,
            nothing: labels.nothing,
            goTo: labels.goTo,
            create: labels.create,
            groups: labels.groups,
          } satisfies PaletteLabels
        }
      />

      {help ? (
        <div className="scrim" onClick={() => setHelp(false)}>
          <div className="palette" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-brand-line px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {labels.shortcutsTitle}
              </h2>
              <button
                type="button"
                className="iconbtn"
                onClick={() => setHelp(false)}
                aria-label={labels.shortcutClose}
              >
                <IconClose size={18} />
              </button>
            </div>
            <ul className="divide-y divide-brand-line px-4 py-1 text-sm">
              {[
                { keys: ["Ctrl", "K"], what: labels.shortcutSearch },
                { keys: ["/"], what: labels.shortcutSearch },
                { keys: ["N"], what: labels.shortcutNew },
                { keys: ["T"], what: labels.shortcutTheme },
                { keys: ["?"], what: labels.shortcutHelp },
                { keys: ["Esc"], what: labels.shortcutClose },
              ].map((row) => (
                <li key={row.what + row.keys.join()} className="flex items-center gap-3 py-2.5">
                  <span className="flex gap-1">
                    {row.keys.map((key) => (
                      <span key={key} className="kbd">
                        {key}
                      </span>
                    ))}
                  </span>
                  <span className="text-brand-graphite">{row.what}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
