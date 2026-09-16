import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { listSettings, savedViews } from "@/db/schema";
import type { MessageKey } from "@/i18n";

/**
 * What a list remembers.
 *
 * Three things make a list bearable to somebody who opens it forty times a day:
 * it comes back filtered the way they left it, a filter worth keeping can be
 * named and pinned, and the columns they never read stay out of the way. All
 * three are stored here, and all three are expressed as the address the list
 * already understands, so every one of them can be bookmarked or sent to a
 * colleague as a link.
 */

export const LISTS = ["clients", "contracts", "leads", "projects"] as const;
export type ListKey = (typeof LISTS)[number];

export type Column = {
  key: string;
  label: MessageKey;
  /** The identifying column. It cannot be put away, and it freezes on scroll. */
  fixed?: boolean;
};

/** Every column each list can show, in the order it appears. */
export const COLUMNS: Record<ListKey, Column[]> = {
  clients: [
    { key: "name", label: "common.name", fixed: true },
    { key: "email", label: "common.email" },
    { key: "phone", label: "common.phone" },
    { key: "country", label: "clients.country" },
    { key: "apartments", label: "clients.apartmentsPlural" },
    { key: "building", label: "clients.building" },
    { key: "partner", label: "clients.partner" },
    { key: "source", label: "clients.source" },
    { key: "status", label: "common.status" },
    { key: "contracts", label: "contracts.title" },
    { key: "marketing", label: "clients.marketing" },
  ],
  contracts: [
    { key: "reference", label: "contracts.reference", fixed: true },
    { key: "client", label: "contracts.client" },
    { key: "unit", label: "contracts.unit" },
    { key: "price", label: "contracts.netPrice" },
    { key: "vat", label: "contracts.vat" },
    { key: "plan", label: "contracts.installmentsCount" },
    { key: "total", label: "common.total" },
    { key: "paid", label: "contracts.paid" },
    { key: "outstanding", label: "dash.outstanding" },
    { key: "status", label: "common.status" },
    { key: "actions", label: "common.actions" },
  ],
  leads: [
    { key: "name", label: "common.name", fixed: true },
    { key: "received", label: "leads.received" },
    { key: "contact", label: "leads.contact" },
    { key: "source", label: "leads.camefrom" },
    { key: "status", label: "common.status" },
    { key: "about", label: "leads.about" },
    { key: "note", label: "leads.note" },
  ],
  projects: [
    { key: "name", label: "common.name", fixed: true },
    { key: "company", label: "projects.company" },
    { key: "partner", label: "clients.partner" },
    { key: "location", label: "projects.location" },
    { key: "completion", label: "projects.completion" },
    { key: "status", label: "common.status" },
    { key: "units", label: "units.title" },
    { key: "value", label: "projects.totalAmount" },
    { key: "sold", label: "projects.soldAmount" },
    { key: "actions", label: "common.actions" },
  ],
};

/** The parameters that belong to a view. Paging and the preview do not. */
/**
 * Paging is not a filter, and neither is the marker that says "show
 * everything". The chosen column is: "the contracts with the most outstanding
 * first" is a way of looking at the list worth saving as a view, so sort and
 * dir stay in.
 */
const NOT_A_FILTER = new Set(["page", "view", "saved", "all", "row"]);

/**
 * The filter part of an address, tidied.
 *
 * Keys are sorted and empty values dropped, so the same filters always produce
 * the same string. That is what lets the list say whether what is on screen is
 * a saved view or something somebody has since changed.
 */
export function filterQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (!value || NOT_A_FILTER.has(key)) continue;
    search.set(key, value);
  }
  return search.toString();
}

export type View = {
  id: string;
  name: string;
  query: string;
  mine: boolean;
  pinned: boolean;
};

/** The views for one list: this person's own, and the office ones. */
export async function viewsFor(userId: string, list: ListKey): Promise<View[]> {
  try {
    const rows = await db
      .select()
      .from(savedViews)
      .where(
        and(
          eq(savedViews.list, list),
          or(eq(savedViews.userId, userId), isNull(savedViews.userId)),
        ),
      )
      .orderBy(asc(savedViews.position), asc(savedViews.name));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      query: row.query,
      mine: row.userId === userId,
      pinned: row.pinned,
    }));
  } catch (error) {
    console.warn("Saved views could not be read. Run npm run db:migrate.", error);
    return [];
  }
}

export async function saveView(input: {
  userId: string;
  list: ListKey;
  name: string;
  query: string;
  everyone: boolean;
}): Promise<string> {
  const [made] = await db
    .insert(savedViews)
    .values({
      userId: input.everyone ? null : input.userId,
      list: input.list,
      name: input.name.slice(0, 60),
      query: input.query,
    })
    .returning({ id: savedViews.id });

  return made.id;
}

export async function updateView(id: string, query: string): Promise<void> {
  await db.update(savedViews).set({ query, updatedAt: new Date() }).where(eq(savedViews.id, id));
}

export async function removeView(id: string): Promise<void> {
  await db.delete(savedViews).where(eq(savedViews.id, id));
}

/** The columns one person has put away on one list. */
export async function hiddenColumns(userId: string, list: ListKey): Promise<string[]> {
  try {
    const [row] = await db
      .select()
      .from(listSettings)
      .where(and(eq(listSettings.userId, userId), eq(listSettings.list, list)))
      .limit(1);

    if (!row) return [];
    const parsed = JSON.parse(row.hidden) as unknown;
    if (!Array.isArray(parsed)) return [];

    const allowed = new Set(
      COLUMNS[list].filter((column) => !column.fixed).map((column) => column.key),
    );
    return parsed.filter((key): key is string => typeof key === "string" && allowed.has(key));
  } catch {
    // A list nobody has customised, or a database without the table yet.
    return [];
  }
}

export async function saveColumns(userId: string, list: ListKey, hidden: string[]): Promise<void> {
  const allowed = new Set(
    COLUMNS[list].filter((column) => !column.fixed).map((column) => column.key),
  );
  const clean = JSON.stringify([...new Set(hidden.filter((key) => allowed.has(key)))]);

  await db
    .insert(listSettings)
    .values({ userId, list, hidden: clean })
    .onConflictDoUpdate({
      target: [listSettings.userId, listSettings.list],
      set: { hidden: clean, updatedAt: new Date() },
    });
}

/** A helper the pages use to decide whether to draw a column at all. */
export function shownColumns(list: ListKey, hidden: string[]) {
  const away = new Set(hidden);
  const on = (key: string) => !away.has(key);
  return { on, hidden: away };
}

/* ---------------------------------------------------------------------------
   Coming back to where you were
   --------------------------------------------------------------------------- */

/** The cookie one list keeps its last filters in, for this browser. */
export const lastCookie = (list: ListKey) => `oe_list_${list}`;

/**
 * Whether a bare visit to a list should be sent to the filters it had last.
 *
 * Only when the address carries nothing at all: the moment somebody has typed a
 * search, followed a link, or pressed All, their intention wins. All also has to
 * survive a reload, which is why it stays in the address as all=1.
 */
export function shouldRestore(params: Record<string, string | undefined>): boolean {
  if (params.all) return false;
  return Object.entries(params).every(([, value]) => !value);
}
