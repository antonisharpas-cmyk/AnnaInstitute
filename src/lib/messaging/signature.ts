/*
 * The One Eleven signature, under "Kind regards, One Eleven" in every email
 * the CRM sends: automatic letters, campaigns, receipts, reports and tests.
 *
 * Everything in it is text, so it reads, copies and translates like the rest
 * of the letter. Only the logo is a picture, carried inside the email itself
 * (an inline attachment), so it shows without the CRM's address being online
 * and without the reader having to allow pictures from a website.
 *
 * To change a number or the address, change it here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const SIGNATURE = {
  heading: "ONE ELEVEN",
  activities: ["Developing", "Investment", "Management"],
  phone: "+357 99 858 784",
  mobile: "+357 24 342 720",
  email: "info@oneeleven-ent.cy",
  address: "Ermou 75, Larnaca 6022",
  website: "www.oneeleven.com.cy",
};

/** Where the letter ends and the signature goes; letterHtml leaves it there. */
export const SIGNATURE_MARK = "<!--oneeleven-signature-->";

/** The name the logo goes by inside the email. */
export const LOGO_CID = "oneeleven-logo@oneeleven";

const FONT = "font-family:'Times New Roman',Times,serif";
const TEAL = "#3D8397";
const DARK = "#121111";
const GRAPHITE = "#4D4D4F";

const tel = (number: string) => `tel:${number.replace(/\s+/g, "")}`;

/** The signature as HTML: the logo on the left, the details on the right. */
export function signatureHtml(withLogo = true): string {
  const s = SIGNATURE;
  const label = (text: string) => `<span style="font-weight:bold;color:${TEAL}">${text}:</span>`;
  const line = (content: string) => `<div style="margin:0;padding:0">${content}</div>`;
  const plainLink = (href: string, text: string) =>
    `<a href="${href}" style="color:${DARK};text-decoration:none">${text}</a>`;
  const details = [
    `<div style="font-weight:bold;font-size:13pt;letter-spacing:1px;color:${GRAPHITE};margin:0 0 2px">${s.heading}</div>`,
    line(`<span style="color:${TEAL}">${s.activities.map((one) => `&bull; ${one}`).join(" ")}</span>`),
    `<div style="height:6px;line-height:6px;font-size:6px">&nbsp;</div>`,
    line(`${label("Phone")} ${plainLink(tel(s.phone), s.phone)}`),
    line(`${label("Mobile")} ${plainLink(tel(s.mobile), s.mobile)}`),
    line(`${label("Email")} ${plainLink(`mailto:${s.email}`, s.email)}`),
    line(s.address),
    line(
      `<a href="https://${s.website}" style="font-weight:bold;color:${TEAL};text-decoration:none">${s.website}</a>`,
    ),
  ].join("");
  const logo = withLogo
    ? `<td valign="middle" style="padding:0 18px 0 0;vertical-align:middle"><img src="cid:${LOGO_CID}" width="130" height="81" alt="OneEleven" style="display:block;width:130px;height:81px;border:0"></td>`
    : "";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-signature style="margin:18px 0 0;border-collapse:collapse">` +
    `<tr>${logo}<td valign="middle" style="${FONT};font-size:10.5pt;line-height:1.4;color:${DARK};vertical-align:middle">${details}</td></tr>` +
    `</table>`
  );
}

/** The same details as plain text, for mail programs that do not show HTML. */
export function signatureText(): string {
  const s = SIGNATURE;
  return [
    s.heading,
    s.activities.map((one) => `• ${one}`).join(" "),
    `Phone: ${s.phone}`,
    `Mobile: ${s.mobile}`,
    `Email: ${s.email}`,
    s.address,
    s.website,
  ].join("\n");
}

const OPT_OUT_TEXT = "\n\nIf you would rather not receive these";

/**
 * A letter with the signature in it.
 *
 * In the HTML it goes where letterHtml marked the end of the letter, so the
 * unsubscribe line stays below it; HTML made some other way gets it at the end.
 * In the text it goes before the unsubscribe line, or at the end.
 */
export function withSignature(letter: { html: string; text: string }, withLogo = true): { html: string; text: string } {
  const block = signatureHtml(withLogo);
  const html = letter.html.includes(SIGNATURE_MARK)
    ? letter.html.replace(SIGNATURE_MARK, block).split(SIGNATURE_MARK).join("")
    : `${letter.html}${block}`;
  const plain = signatureText();
  const at = letter.text.lastIndexOf(OPT_OUT_TEXT);
  const text =
    at >= 0
      ? `${letter.text.slice(0, at)}\n\n${plain}${letter.text.slice(at)}`
      : `${letter.text.replace(/\s+$/, "")}\n\n${plain}`;
  return { html, text };
}

let logo: Buffer | null | undefined;

/** The logo file, read once. Missing, the signature goes without the picture. */
export function signatureLogo(): Buffer | null {
  if (logo !== undefined) return logo;
  try {
    logo = readFileSync(path.join(process.cwd(), "public", "brand", "oneeleven-logo.png"));
  } catch {
    logo = null;
  }
  return logo;
}
