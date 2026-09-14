import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dashboardLayouts } from "@/db/schema";
import type { MessageKey } from "@/i18n";

/**
 * The dashboard, as the person signed in wants it.
 *
 * The screen is a list of panels rather than a fixed page: each one knows how
 * wide it is and whether it is on show, and the order of the list is the order
 * of the screen. That list is stored against the person, so the woman chasing
 * payments can lead with what is late while the man watching stock leads with
 * the apartments, and both find their own screen from any computer.
 *
 * A panel added to the CRM later is appended to everybody's list rather than
 * dropped, and a panel taken out of the CRM disappears from a stored list
 * without anybody having to repair it.
 */

export const PANEL_KEYS = [
  "tiles",
  "figures",
  "meters",
  "cash",
  "stock",
  "sales",
  "funnel",
  "projects",
  "attention",
  "activity",
  "overdue",
  "upcoming",
  "payments",
] as const;

export type PanelKey = (typeof PANEL_KEYS)[number];

/** Sixths of the row: a third, a half, two thirds, or the whole width. */
export type PanelWidth = 2 | 3 | 4 | 6;

export type Panel = { key: PanelKey; width: PanelWidth; shown: boolean };

export const WIDTHS: PanelWidth[] = [2, 3, 4, 6];

/** The screen everybody starts with, which is the one the office asked for. */
export const DEFAULT_LAYOUT: Panel[] = [
  { key: "tiles", width: 6, shown: true },
  { key: "figures", width: 6, shown: true },
  { key: "meters", width: 6, shown: true },
  { key: "cash", width: 4, shown: true },
  { key: "stock", width: 2, shown: true },
  { key: "sales", width: 2, shown: true },
  { key: "funnel", width: 2, shown: true },
  { key: "projects", width: 2, shown: true },
  { key: "attention", width: 2, shown: true },
  { key: "activity", width: 4, shown: true },
  { key: "overdue", width: 3, shown: true },
  { key: "upcoming", width: 3, shown: true },
  { key: "payments", width: 6, shown: true },
];

/** What each panel is called in the arrange list, in either language. */
export const PANEL_TITLE: Record<PanelKey, MessageKey> = {
  tiles: "dash.quick",
  figures: "panel.figures",
  meters: "dash.collection",
  cash: "reports.cashflow",
  stock: "dash.stock",
  sales: "reports.monthlySales",
  funnel: "reports.funnel",
  projects: "dash.byProject",
  attention: "dash.attention",
  activity: "dash.activity",
  overdue: "dash.overdue",
  upcoming: "dash.nextPayments",
  payments: "dash.recentPayments",
};

/** One line saying what a panel is for, so a hidden one can be found again. */
export const PANEL_NOTE: Record<PanelKey, MessageKey> = {
  tiles: "panel.note.tiles",
  figures: "panel.note.figures",
  meters: "panel.note.meters",
  cash: "panel.note.cash",
  stock: "panel.note.stock",
  sales: "panel.note.sales",
  funnel: "panel.note.funnel",
  projects: "panel.note.projects",
  attention: "panel.note.attention",
  activity: "panel.note.activity",
  overdue: "panel.note.overdue",
  upcoming: "panel.note.upcoming",
  payments: "panel.note.payments",
};

/**
 * Tailwind reads these as written, so the classes are spelled out rather than
 * built from the number. Below a wide screen every panel takes the whole row,
 * which is what makes the same dashboard work on a telephone.
 */
const WIDTH_CLASS: Record<PanelWidth, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
};

export const widthClass = (width: PanelWidth) => WIDTH_CLASS[width] ?? WIDTH_CLASS[6];

export const WIDTH_LABEL: Record<PanelWidth, MessageKey> = {
  2: "panel.third",
  3: "panel.half",
  4: "panel.twoThirds",
  6: "panel.full",
};

/** Anything stored is read back defensively: it came from a text column. */
function parse(stored: string): Panel[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: Panel[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const key = (item as { key?: unknown }).key;
    if (typeof key !== "string") continue;
    if (!(PANEL_KEYS as readonly string[]).includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const width = Number((item as { width?: unknown }).width);
    out.push({
      key: key as PanelKey,
      width: (WIDTHS as number[]).includes(width) ? (width as PanelWidth) : 6,
      shown: (item as { shown?: unknown }).shown !== false,
    });
  }

  return out;
}

/** The stored list, with any panel it has never heard of added at the end. */
export function withEveryPanel(panels: Panel[]): Panel[] {
  const known = new Set(panels.map((panel) => panel.key));
  const missing = DEFAULT_LAYOUT.filter((panel) => !known.has(panel.key));
  return [...panels, ...missing];
}

export async function readLayout(userId: string): Promise<Panel[]> {
  const [row] = await db
    .select()
    .from(dashboardLayouts)
    .where(eq(dashboardLayouts.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_LAYOUT;

  const stored = parse(row.panels);
  return stored.length === 0 ? DEFAULT_LAYOUT : withEveryPanel(stored);
}

export async function writeLayout(userId: string, panels: Panel[]): Promise<void> {
  const clean = withEveryPanel(parse(JSON.stringify(panels)));

  await db
    .insert(dashboardLayouts)
    .values({ userId, panels: JSON.stringify(clean) })
    .onConflictDoUpdate({
      target: dashboardLayouts.userId,
      set: { panels: JSON.stringify(clean), updatedAt: new Date() },
    });
}

export async function forgetLayout(userId: string): Promise<void> {
  await db.delete(dashboardLayouts).where(eq(dashboardLayouts.userId, userId));
}

/** Read a layout out of what the arrange form posted. */
export function layoutFromForm(value: string): Panel[] {
  const panels = parse(value);
  return panels.length === 0 ? DEFAULT_LAYOUT : withEveryPanel(panels);
}
