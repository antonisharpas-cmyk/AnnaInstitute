/**
 * Is it the same person?
 *
 * One person can be on the CRM several times: a client who is also a director
 * of a partner company, a shareholder who is on the team, an agent who bought
 * an apartment. A message meant for each person once has to know that, and
 * the surest thing two records can share is an email address or a mobile
 * number. Written the same way here, whatever way they were typed.
 */

/** An email address as it is compared: trimmed, small letters. */
export function sameEmail(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim().toLowerCase();
  return clean.includes("@") ? clean : null;
}

/**
 * A telephone number as it is compared: the digits only, and the last eight
 * of them, which is a Cypriot number with or without +357 or 00357 in front.
 * Anything shorter than eight digits is not a number to match on.
 */
export function samePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : null;
}

/** Every handle a person can be known by, for matching. */
export function handlesOf(...contacts: { email?: string | null; phone?: string | null }[]): string[] {
  const out = new Set<string>();
  for (const one of contacts) {
    const email = sameEmail(one.email);
    const phone = samePhone(one.phone);
    if (email) out.add(`e:${email}`);
    if (phone) out.add(`p:${phone}`);
  }
  return [...out];
}

/**
 * People grouped into the persons they are: two records sharing any email
 * address or mobile number are one person, and so is a chain of them.
 * Returns, for each record's index, the index of its group.
 */
export function groupPeople(handles: string[][]): number[] {
  const parent = handles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  handles.forEach((list, i) => {
    for (const handle of list) {
      const seen = owner.get(handle);
      if (seen === undefined) owner.set(handle, i);
      else parent[find(i)] = find(seen);
    }
  });
  return handles.map((_, i) => find(i));
}
