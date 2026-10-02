import Link from "next/link";
import type { translator } from "@/i18n";

type Translator = ReturnType<typeof translator>;
import type { FollowUpLine } from "@/lib/followUps";
import { Card, Empty, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { addFollowUpFromList, deleteFollowUp, setFollowUpStatus } from "@/app/(app)/leads/actions";

/**
 * The follow ups with one client, on the client's own page.
 *
 * The same records as in the Follow ups section and on the calendar, so one
 * added here shows there at once. Those from when the client was still a lead
 * are here too, with a word saying so.
 */
export default function ClientFollowUps({
  clientId,
  rows,
  team,
  locale,
  t,
}: {
  clientId: string;
  rows: FollowUpLine[];
  team: { id: string; name: string }[];
  locale: string;
  t: Translator;
}) {
  const tag = locale === "el" ? "el-GR" : "en-GB";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const late = (row: { at: Date; status: string }) =>
    row.status === "PENDING" && new Date(row.at) < startOfToday;

  return (
    <Card title={t("followUps.title")}>
      <div className="mb-4" data-client-follow-ups>
        <Disclosure showLabel={t("followUps.add")} hideLabel={t("common.cancel")}>
          <form
            key={rows.length}
            action={addFollowUpFromList}
            className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input type="hidden" name="with" value={`client:${clientId}`} />
            <div>
              <label className="label" htmlFor="clientFollowUpDay">
                {t("leads.followUpDay")}
              </label>
              <DateField id="clientFollowUpDay" name="day" required />
            </div>
            <div>
              <label className="label" htmlFor="clientFollowUpTime">
                {t("appointments.time")}
              </label>
              <TimeField id="clientFollowUpTime" name="time" locale={locale} />
            </div>
            <div>
              <label className="label" htmlFor="clientFollowUpAssigned">
                {t("appointments.assignTo")}
              </label>
              <select id="clientFollowUpAssigned" name="assignedToId" className="select" defaultValue="">
                <option value="">{t("appointments.nobody")}</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="clientFollowUpNote">
                {t("leads.followUpNote")}
              </label>
              <input
                id="clientFollowUpNote"
                name="note"
                placeholder={t("leads.followUpNoteHint")}
                className="input"
              />
            </div>
            <div className="flex items-end lg:col-span-4">
              <SubmitButton>{t("common.save")}</SubmitButton>
            </div>
          </form>
        </Disclosure>
      </div>

      {rows.length === 0 ? (
        <Empty message={t("followUps.none")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>{t("leads.followUpDay")}</th>
                <th>{t("leads.followUpNote")}</th>
                <th>{t("appointments.assignedTo")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ followUp, lead, member }) => (
                <tr key={followUp.id} data-client-follow-up={followUp.status}>
                  <td className="nowrap text-xs">
                    <span className={late(followUp) ? "font-semibold" : ""}>
                      {new Date(followUp.at).toLocaleDateString(tag, {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    <div className="text-brand-graphite/60">
                      {new Date(followUp.at).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="text-xs">
                    {followUp.note ?? ""}
                    {lead ? (
                      <div className="text-brand-graphite/60">
                        <Link href={`/leads/${lead.id}`} className="hover:underline" prefetch={false}>
                          {t("followUps.fromLead")}
                        </Link>
                      </div>
                    ) : null}
                  </td>
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
                        followUp.status === "DONE"
                          ? "good"
                          : followUp.status === "CANCELLED" || late(followUp)
                            ? "bad"
                            : "warn"
                      }
                    >
                      {t(
                        followUp.status === "DONE"
                          ? "leads.followUpDone"
                          : followUp.status === "CANCELLED"
                            ? "appointments.cancelled"
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
                          lead?.id ?? null,
                          followUp.status === "PENDING" ? "DONE" : "PENDING",
                        )}
                      >
                        <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                          {t(followUp.status === "PENDING" ? "leads.followUpMarkDone" : "leads.followUpReopen")}
                        </SubmitButton>
                      </form>
                      {followUp.status === "PENDING" ? (
                        <form action={setFollowUpStatus.bind(null, followUp.id, lead?.id ?? null, "CANCELLED")}>
                          <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                            {t("followUps.cancel")}
                          </SubmitButton>
                        </form>
                      ) : null}
                      <ConfirmButton
                        action={deleteFollowUp.bind(null, followUp.id, lead?.id ?? null)}
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
  );
}
