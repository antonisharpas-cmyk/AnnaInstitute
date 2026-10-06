import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { upcomingBirthdays, type UpcomingBirthday } from "@/lib/automaticEmails";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";

const RANGES = [7, 30, 90, 365];

const STATE_TONE: Record<UpcomingBirthday["state"], "good" | "warn" | "bad" | "neutral" | "teal"> = {
  SENT: "good",
  TODAY: "teal",
  DUE: "neutral",
  NO_EMAIL: "bad",
  OFF: "warn",
  SKIPPED: "warn",
  FAILED: "bad",
};

/**
 * The birthdays to come: who will be wished, on which day, at which address,
 * and who cannot be because there is no email on their record, in time to add
 * one. One line per person, exactly as the wishes go: somebody who is both a
 * director and a client is one line and one email.
 */
export default async function UpcomingBirthdaysPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : 30;
  const rows = await upcomingBirthdays(days);
  const tag = locale === "el" ? "el-GR" : "en-GB";
  const dayText = (value: Date) => value.toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const cannot = rows.filter((row) => row.state === "NO_EMAIL").length;
  const today = rows.filter((row) => row.day.toDateString() === new Date().toDateString()).length;

  return (
    <>
      <BackLink href="/emails" label={t("birthdays.back")} />
      <PageHeader title={t("birthdays.title")} subtitle={t("birthdays.subtitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-2" data-birthday-range>
        <span className="text-xs text-brand-graphite/60">{t("birthdays.show")}</span>
        {RANGES.map((n) => (
          <Link
            key={n}
            href={`/emails/birthdays?days=${n}`}
            className={`btn !px-3 !py-1 !text-xs ${n === days ? "btn-primary" : "btn-secondary"}`}
          >
            {t(`birthdays.range.${n}` as MessageKey)}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t("birthdays.count")} value={String(rows.length)} />
        <Stat label={t("birthdays.today")} value={String(today)} tone={today > 0 ? "teal" : undefined} />
        <Stat label={t("birthdays.cannot")} value={String(cannot)} tone={cannot > 0 ? "bad" : "good"} hint={cannot > 0 ? t("birthdays.cannotHint") : undefined} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty message={t("birthdays.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data" data-birthdays>
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("birthdays.person")}</th>
                  <th>{t("birthdays.onTheCrm")}</th>
                  <th>{t("birthdays.email")}</th>
                  <th>{t("birthdays.whatHappens")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.day.toISOString()}-${i}`} data-birthday={row.name} data-birthday-state={row.state}>
                    <td className="nowrap text-xs">{dayText(row.day)}</td>
                    <td>
                      <span className="font-semibold">{row.name}</span>
                      {row.age ? (
                        <div className="text-xs text-brand-graphite/60">
                          {t("birthdays.turns")} {row.age}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-xs">
                      {row.records.map((one, n) => (
                        <div key={n}>
                          <Link href={one.href} className="text-brand-teal-dark hover:underline">
                            {t(`birthdays.what.${one.what.replace(" ", "_")}` as MessageKey)}
                          </Link>
                          {one.name !== row.name ? <span className="text-brand-graphite/60"> ({one.name})</span> : null}
                        </div>
                      ))}
                    </td>
                    <td className="text-xs">{row.email ?? <span className="text-[color:var(--color-negative)]">{t("birthdays.noEmail")}</span>}</td>
                    <td className="text-xs">
                      <Pill tone={STATE_TONE[row.state]}>{t(`birthdays.state.${row.state}` as MessageKey)}</Pill>
                      {row.reason && row.state !== "SENT" ? <div className="mt-0.5 text-brand-graphite/60">{row.reason}</div> : null}
                      {row.state === "SENT" && row.at ? (
                        <div className="mt-0.5 text-brand-graphite/60">{row.at.toLocaleString(tag, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
