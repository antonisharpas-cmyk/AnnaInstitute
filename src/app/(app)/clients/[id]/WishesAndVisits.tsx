import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { appointments, partners } from "@/db/schema";
import { Card, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { dayAndTime } from "@/lib/when";
import { partnerName } from "@/lib/parties";
import type { getTranslator, MessageKey } from "@/i18n";
import { setClientWishes } from "../actions";

type T = Awaited<ReturnType<typeof getTranslator>>["t"];

/** The showrooms every buyer is sent to, always listed, visited or not. */
const SHOWROOMS = ["BATHROOMS_TILES", "TIMBER"] as const;

/**
 * What the client wants with the apartment, and whether they have been to our
 * partners. The wishes are asked and typed by the office; the visits come from
 * the client's appointments: at Studio Bagno or Ocriam, or with a partner.
 */
export default async function WishesAndVisits({
  client,
  t,
  locale,
}: {
  client: { id: string; wantsAppliances: string | null; wantsAirCondition: string | null };
  t: T;
  locale: string;
}) {
  const rows = await db
    .select({ appointment: appointments, partner: partners })
    .from(appointments)
    .leftJoin(partners, eq(partners.id, appointments.partnerId))
    .where(
      and(
        eq(appointments.clientId, client.id),
        or(inArray(appointments.type, [...SHOWROOMS]), isNotNull(appointments.partnerId)),
      ),
    )
    .orderBy(desc(appointments.at));

  /*
   * One line a place: the showrooms first, then each partner met. Every
   * appointment there counts: how many times they went and when last, the
   * next one booked, and, when they never went, the last missed or unmarked.
   */
  type Appointment = (typeof rows)[number]["appointment"];
  type Place = { name: string; went: number; lastWent: Appointment | null; next: Appointment | null; other: Appointment | null };
  const places = new Map<string, Place>();
  const blank = (name: string): Place => ({ name, went: 0, lastWent: null, next: null, other: null });
  for (const kind of SHOWROOMS) places.set(kind, blank(t(`appointments.type.${kind}` as MessageKey)));
  const now = Date.now();
  for (const row of rows) {
    const key = row.partner ? `partner:${row.partner.id}` : row.appointment.type;
    const name = row.partner ? partnerName(row.partner) : t(`appointments.type.${row.appointment.type}` as MessageKey);
    const place = places.get(key) ?? blank(name);
    places.set(key, place);
    const one = row.appointment;
    if (one.status === "DONE") {
      place.went += 1;
      if (!place.lastWent || one.at > place.lastWent.at) place.lastWent = one;
    } else if (one.status === "PLANNED" && one.at.getTime() > now) {
      /* The soonest booking still to come. */
      if (!place.next || one.at < place.next.at) place.next = one;
    } else if (one.status === "MISSED" || one.status === "PLANNED") {
      if (!place.other || one.at > place.other.at) place.other = one;
    }
  }

  const choice = (name: string, label: string, current: string | null) => (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={current ?? ""} className="select">
        <option value="">{t("clients.wish.notAsked")}</option>
        <option value="YES">{t("clients.wish.yes")}</option>
        <option value="NO">{t("clients.wish.no")}</option>
        <option value="UNDECIDED">{t("clients.wish.undecided")}</option>
      </select>
    </div>
  );

  return (
    <Card title={t("clients.wishesTitle")}>
      <form action={setClientWishes.bind(null, client.id)} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" data-client-wishes>
        {choice("wantsAppliances", t("clients.wish.appliances"), client.wantsAppliances)}
        {choice("wantsAirCondition", t("clients.wish.airCondition"), client.wantsAirCondition)}
        <SubmitButton className="btn btn-secondary">{t("common.save")}</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-brand-graphite/60">{t("clients.wishesHint")}</p>

      <p className="label mt-4">{t("clients.visitsTitle")}</p>
      <ul className="divide-y divide-brand-line rounded border border-brand-line text-sm" data-client-visits>
        {[...places.values()].map(({ name, went, lastWent, next, other }) => {
          /* A missed or unmarked appointment matters only when it came after the last visit. */
          const pending = other && (!lastWent || other.at > lastWent.at) ? other : null;
          return (
            <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-medium">{name}</span>
              <span className="flex flex-wrap justify-end gap-1">
                {lastWent && (
                  <Pill tone="good">
                    {went > 1
                      ? `${t("clients.visit.wentTimes").replace("{n}", String(went))} ${dayAndTime(lastWent.at, locale)}`
                      : `${t("clients.visit.went")} ${dayAndTime(lastWent.at, locale)}`}
                  </Pill>
                )}
                {pending &&
                  (pending.status === "MISSED" ? (
                    <Pill tone="bad">
                      {t("clients.visit.missed")} {dayAndTime(pending.at, locale)}
                    </Pill>
                  ) : (
                    <Pill tone="warn">
                      {t("clients.visit.unmarked")} {dayAndTime(pending.at, locale)}
                    </Pill>
                  ))}
                {next && (
                  <Pill tone="teal">
                    {t("clients.visit.booked")} {dayAndTime(next.at, locale)}
                  </Pill>
                )}
                {!lastWent && !pending && !next && <Pill tone="neutral">{t("clients.visit.notYet")}</Pill>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-brand-graphite/60">{t("clients.visitsHint")}</p>
    </Card>
  );
}
