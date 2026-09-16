/**
 * A filter that takes more than one answer.
 *
 * Every filter in the CRM is a comma separated list in the address now:
 * ?status=NEW,CONTACTED reads as "the new ones and the ones we have contacted",
 * and ?status=NEW still reads as it always did, so every link anybody has
 * bookmarked or saved as a view keeps working.
 *
 * Read here rather than in each list, so the twelve filters cannot drift apart
 * on what a blank value or a stray comma means.
 */
export function many(value: string | undefined | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

/** The same, kept to the values the column actually allows. */
export function manyOf<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
): T[] {
  return many(value).filter((one): one is T => (allowed as readonly string[]).includes(one));
}

/** Is anything filtered at all, ignoring the housekeeping parameters? */
export function anyFilter(
  params: Record<string, string | undefined>,
  ignore: readonly string[] = [],
): boolean {
  const housekeeping = new Set(["page", "view", "saved", "all", "row", "sort", "dir", ...ignore]);
  return Object.entries(params).some(([key, value]) => Boolean(value) && !housekeeping.has(key));
}
