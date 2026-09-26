/**
 * A moment as the office reads it: the day and the time, 25/09/2026 14:32.
 *
 * Used wherever a record was made at a particular time (a file uploaded, a
 * paper issued, a commission generated or paid) so two things done on the
 * same day can still be told apart and put in order.
 */
export function dayAndTime(value: Date | string | null | undefined, locale = "en"): string {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const tag = locale === "el" ? "el-GR" : "en-GB";
  const day = at.toLocaleDateString(tag, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = at.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${time}`;
}

/** Newest first, by when the record was made. */
export function newestFirst<T extends { createdAt: Date | string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
