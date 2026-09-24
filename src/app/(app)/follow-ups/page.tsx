import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { followUpCounts, listFollowUps } from "@/lib/followUps";
import { whoCanGo } from "@/lib/team";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import { Figure } from "@/components/charts";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import SearchSelect from "@/components/SearchSelect";
import { whoCanBeMet } from "@/lib/appointments";
import { addFollowUpFromList, deleteFollowUp, setFollowUpStatus } from "../leads/actions";

/**
 * Every follow up, in one list.
 *
 * The office asked the right question: with a hundred enquiries each carrying a
 * pending follow up, where do you look? Not at a hundred cards. Here: soonest
 * first, overdue at the top of the mind because it has its own figure and its
 * own view, narrowed to one person when somebody wants their own, and each line
 * answerable where it stands so a morning of telephone calls is a morning of
 * pressing Done rather than a morning of opening records.
 */
const VIEWS = ["overdue", "today", "week", "all"] as const;

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string; status?: string; assignedTo?: string }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const when = VIEWS.includes((params.when ?? "") as (typeof VIEWS)[number])
    ? (params.when as string)
    : "all";
  const status = params.status ?? (when === "all" ? "PENDING" : "");
  const assignedTo = params.assignedTo ?? "";

  const [rows, counts, team, people] = await Promise.all([
    listFollowUps({ when, status, assignedTo }),
    followUpCounts(),
    whoCanGo(),
    whoCanBeMet(),
  ]);

  const dayOf = (value: Date) =>
    new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const timeOf = (value: Date) =>
    new Date(value).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const late = (row: { at: Date; status: string }) =>
    row.status === "PENDING" && new Date(row.at) < startOfToday;

  const keep = (extra: Record<string, string>) => {
    const search = new URLSearchParams();
    if (when !== "all") search.set("when", when);
    if (status) search.set("status", status);
    if (assignedTo) search.set("assignedTo", assignedTo);
    for (const [key, value] of Object.entries(extra)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    const query = search.toString();
    return query ? `/follow-ups?${query}` : "/follow-ups";
  };

  return (
    <>
      <PageHeader title={t("followUps.title")} subtitle={t("followUps.subtitle")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Figure label={t("followUps.pending")} value={String(counts.pending)} />
        <Figure label={t("followUps.overdue")} value={String(counts.overdue)} />
        <Figure label={t("followUps.done")} value={String(counts.done)} />
      </div>

      {/* eslint-disable @next/next/no-html-link-for-pages */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {VIEWS.map((one) => (
          <a
            key={one}
            href={keep({ when: one === "all" ? "" : one })}
            className="tab"
            data-on={when === one ? "true" : "false"}
          >
            {t(`followUps.when.${one}` as "followUps.when.all")}
          </a>
        ))}

        {/* Whose they are. A plain form so the choice is an address. */}
        <form action="/follow-ups" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="when" value={when === "all" ? "" : when} />
          <div>
            <label className="label" htmlFor="assignedTo">
              {t("appointments.assignedTo")}
            </label>
            <select
              id="assignedTo"
              name="assignedTo"
              defaultValue={assignedTo}
              className="select !w-48 !py-1 !text-xs"
            >
              <option value="">{t("common.all")}</option>
              {team.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">
              {t("common.status")}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="select !w-40 !py-1 !text-xs"
            >
              <option value="">{t("common.all")}</option>
              <option value="PENDING">{t("leads.followUpPending")}</option>
              <option value="DONE">{t("leads.followUpDone")}</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
            {t("common.search")}
          </button>
        </form>
      </div>
      {/* eslint-enable @next/next/no-html-link-for-pages */}

      {/*
        A new follow up, written from here for any open enquiry. It is the same
        record as one written on the enquiry, so it shows on its card at once.
      */}
      <div className="mb-4">
        <Disclosure showLabel={t("followUps.add")} hideLabel={t("common.cancel")}>
          <form
            key={rows.length}
            action={addFollowUpFromList}
            className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto]"
          >
            <div>
              <label className="label" htmlFor="followUpLead">
                {t("followUps.forWhom")}
              </label>
              <SearchSelect
                id="followUpLead"
                name="leadId"
                required
                choose={t("common.choose")}
                searchPlaceholder={t("common.searchByName")}
                noMatch={t("common.noMatch")}
                options={people.leads.map((one) => ({
                  value: one.id,
                  label: [one.firstName, one.lastName].filter(Boolean).join(" ") || "?",
                  hint: one.phone ?? one.email ?? undefined,
                }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="followUpDay">
                {t("leads.followUpDay")}
              </label>
              <DateField id="followUpDay" name="day" required />
            </div>
            <div>
              <label className="label" htmlFor="followUpTime">
                {t("appointments.time")}
              </label>
              <TimeField id="followUpTime" name="time" locale={locale} />
            </div>
            <div>
              <label className="label" htmlFor="followUpNote">
                {t("leads.followUpNote")}
              </label>
              <input
                id="followUpNote"
                name="note"
                placeholder={t("leads.followUpNoteHint")}
                className="input"
              />
            </div>
            <div className="flex items-end">
              <SubmitButton>{t("common.save")}</SubmitButton>
            </div>
          </form>
        </Disclosure>
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty message={t("followUps.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("leads.followUpDay")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("leads.followUpNote")}</th>
                  <th>{t("appointments.assignedTo")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ followUp, lead, member }) => (
                  <tr key={followUp.id}>
                    <td className="nowrap text-xs">
                      <span className={late(followUp) ? "font-semibold" : ""}>
                        {dayOf(followUp.at)}
                      </span>
                      <div className="text-brand-graphite/60">{timeOf(followUp.at)}</div>
                    </td>
                    <td>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-semibold hover:underline"
                        prefetch={false}
                      >
                        {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "?"}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {[lead.phone, lead.email].filter(Boolean).join(" . ")}
                      </div>
                    </td>
                    <td className="text-xs">{followUp.note ?? ""}</td>
                    <td className="text-xs">
                      {member ? (
                        member.name
                      ) : (
                        <span className="text-brand-graphite/50">{t("appointments.nobody")}</span>
                      )}
                    </td>
                    <td>
                      <Pill
                        tone={
                          followUp.status === "DONE" ? "good" : late(followUp) ? "bad" : "warn"
                        }
                      >
                        {t(
                          followUp.status === "DONE"
                            ? "leads.followUpDone"
                            : late(followUp)
                              ? "followUps.late"
                              : "leads.followUpPending",
                        )}
                      </Pill>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <form
                          action={setFollowUpStatus.bind(
                            null,
                            followUp.id,
                            lead.id,
                            followUp.status === "DONE" ? "PENDING" : "DONE",
                          )}
                        >
                          <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                            {t(
                              followUp.status === "DONE"
                                ? "leads.followUpReopen"
                                : "leads.followUpMarkDone",
                            )}
                          </SubmitButton>
                        </form>
                        <ConfirmButton
                          action={deleteFollowUp.bind(null, followUp.id, lead.id)}
                          label={t("common.delete")}
                          confirm={t("remove.sure")}
                        />
                      </div>
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
