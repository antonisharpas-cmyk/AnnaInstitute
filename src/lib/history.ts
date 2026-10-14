import "server-only";
import { readSetting } from "@/lib/settings";

/*
 * Recording history.
 *
 * Before the CRM, the office's sales, payments, commissions and invoices lived
 * in books and spreadsheets. To bring them in, the office switches this on in
 * Settings. While it is on, whatever is entered is the past: a payment gets no
 * invoice or receipt of ours and no letter, an invoice we were sent can be
 * entered without its file, an invoice of ours is not numbered or drawn again,
 * and nothing entered this way is ever counted as a paper missing in Needs
 * attention or the bell. Each record carries the mark for good, so switching
 * it off afterwards changes nothing about what was entered.
 */
export async function recordingHistory(): Promise<boolean> {
  try {
    return (await readSetting("history.mode")) === "yes";
  } catch {
    return false;
  }
}
