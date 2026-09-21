import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { listAppointments, needsAnAnswer, whoCanBeMet } from "@/lib/appointments";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import SearchBox from "@/components/SearchBox";
import { answerAppointment, createAppointment, deleteAppointment } from "./actions";

/**
 * Every appointment the office has, in one place.
 *
 * Three views of the same list, because the office asks three different
 * questions of it. What is coming up, which is the one they live in. What is
 * waiting for an answer, which is yesterday's meetings that nobody has said yes
 * or no to. And what has been, which is the history.
 *
 * Every row names the person it is with and links to their card, because an
 * appointment is never about a place, it is about somebody.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; when?: string; status?: string }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const when = params.when ?? "next";
  const [rows, people] = await Promise.all([
    listAppointments({ q: params.q, when, status: params.status }),
    whoCanBeMet(),
  ]);

  const dayOf = (at: Date) =>
    new Date(at).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const timeOf = (at: Date) =>
    new Date(at).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
      hour: locale === "el" ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: locale !== "el",
    });

  const tabs: { key: string; label: string }[] = [
    { key: "next", label: t("appointments.comingUp") },
    { key: "waiting", label: t("appointments.waitingShort") },
    { key: "past", label: t("appointments.beenAndGone") },
  ];

  return (
    <>
      <PageHeader title={t("appointments.title")} subtitle={t("appointments.subtitle")} />

      <Card>
        {/* Which of the three questions is being asked. */}
        <div className="mb-3 flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/appointments?when=${tab.key}`}
              prefetch={false}
              className={`btn !px-3 !py-1 !text-xs ${
                when === tab.key ? "btn-primary" : "btn-secondary"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <SearchBox
          action="/appointments"
          query={params.q ?? ""}
          placeholder={t("appointments.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
          keep={{ when }}
          filtered={Boolean(params.q)}
          resetLabel={t("list.resetAll")}
        />

        {/* Arranging one from here, where the person has to be named. */}
        <div className="mb-4">
          <Disclosure showLabel={t("appointments.add")} hideLabel={t("common.cancel")}>
            <form
              action={createAppointment}
              className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-4"
            >
              <div className="sm:col-span-2">
                <label className="label" htmlFor="place">
                  {t("appointments.place")}
                </label>
                <input
                  id="place"
                  name="place"
                  required
                  placeholder={t("appointments.placeHint")}
                  className="input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="with">
                  {t("appointments.who")}
                </label>
                <select id="with" name="with" required className="select" defaultValue="">
                  <option value="">{t("common.choose")}</option>
                  <optgroup label={t("nav.clients")}>
                    {people.clients.map((one) => (
                      <option key={one.id} value={`client:${one.id}`}>
                        {one.firstName} {one.lastName}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("nav.leads")}>
                    {people.leads.map((one) => (
                      <option key={one.id} value={`lead:${one.id}`}>
                        {one.firstName} {one.lastName}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="day">
                  {t("appointments.day")}
                </label>
                <DateField id="day" name="day" required />
              </div>
              <div>
                <label className="label" htmlFor="time">
                  {t("appointments.time")}
                </label>
                <input
                  id="time"
                  name="time"
                  type="time"
                  required
                  defaultValue="16:00"
                  className="input"
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <SubmitButton>{t("common.save")}</SubmitButton>
              </div>
            </form>
          </Disclosure>
        </div>

        {rows.length === 0 ? (
          <Empty message={t("appointments.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("appointments.place")}</th>
                  <th>{t("appointments.who")}</th>
                  <th className="ctr">{t("appointments.day")}</th>
                  <th className="ctr">{t("appointments.time")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ appointment, client, lead }) => {
                  const asking = needsAnAnswer(appointment);
                  return (
                    <tr key={appointment.id}>
                      <td className="font-semibold">{appointment.place}</td>
                      <td>
                        {client ? (
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-brand-teal-dark hover:underline"
                            prefetch={false}
                          >
                            {client.firstName} {client.lastName}
                          </Link>
                        ) : lead ? (
                          <>
                            <Link
                              href={`/leads/${lead.id}`}
                              className="text-brand-teal-dark hover:underline"
                              prefetch={false}
                            >
                              {lead.firstName} {lead.lastName}
                            </Link>
                            <div className="text-xs text-brand-graphite/60">
                              {t("appointments.anEnquiry")}
                            </div>
                          </>
                        ) : (
                          <span className="text-brand-graphite/50">{t("common.none")}</span>
                        )}
                      </td>
                      <td className="ctr nowrap">{dayOf(appointment.at)}</td>
                      <td className="ctr nowrap">{timeOf(appointment.at)}</td>
                      <td>
                        {asking ? (
                          <Pill tone="warn">{t("appointments.waitingShort")}</Pill>
                        ) : (
                          <Pill
                            tone={
                              appointment.status === "DONE"
                                ? "good"
                                : appointment.status === "MISSED"
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {t(
                              appointment.status === "DONE"
                                ? "appointments.done"
                                : appointment.status === "MISSED"
                                  ? "appointments.missed"
                                  : "appointments.planned",
                            )}
                          </Pill>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {appointment.status !== "DONE" ? (
                            <form action={answerAppointment.bind(null, appointment.id, "DONE")}>
                              <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                                {t("appointments.itHappened")}
                              </SubmitButton>
                            </form>
                          ) : null}
                          {appointment.status !== "MISSED" ? (
                            <form action={answerAppointment.bind(null, appointment.id, "MISSED")}>
                              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                                {t("appointments.itDidNot")}
                              </SubmitButton>
                            </form>
                          ) : null}
                          <ConfirmButton
                            action={deleteAppointment.bind(null, appointment.id)}
                            label={t("common.delete")}
                            confirm={t("remove.sure")}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-brand-graphite/55">{t("appointments.hint")}</p>
      </Card>
    </>
  );
}
