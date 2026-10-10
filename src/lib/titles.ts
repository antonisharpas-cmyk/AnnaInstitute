/**
 * How a letter greets a client: "Dear Mrs. Maria", or "Dear Maria" when the
 * office has not said. No server code here, so the forms can use it too.
 */
export const TITLES = ["MR", "MRS", "MS"] as const;
export type Title = (typeof TITLES)[number];

const WORDS: Record<Title, string> = { MR: "Mr.", MRS: "Mrs.", MS: "Ms." };

/** The title as the letters print it, or nothing. */
export function titleWord(code: string | null | undefined): string {
  return code && code in WORDS ? WORDS[code as Title] : "";
}

/** A title from a form, or nothing. */
export function titleFrom(value: unknown): Title | null {
  const code = String(value ?? "").trim().toUpperCase();
  return (TITLES as readonly string[]).includes(code) ? (code as Title) : null;
}
