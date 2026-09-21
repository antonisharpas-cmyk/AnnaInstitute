import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { listAppointments, needsAnAnswer, whoCanBeMet } from "@/lib/appointments";
import { whoCanGo } from "@/lib/team";
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
/** The six kinds, in the order the office listed them. */
const KINDS = ["TIMBER", "BATHROOMS_TILES", "OFFICE", "PHONE_CALL", "BUILDING", "OTHER"] as const;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    when?: string;
    status?: string;
    assignedTo?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const when = params.when ?? "next";
  const [rows, people, team] = await Promise.all([
    listAppointments({
      q: params.q,
      when,
      status: params.status,
      assignedTo: params.assignedTo,
      type: params.type,
    }),
    whoCanBeMet(),
    whoCanGo(),
  ]);

  /** The filters, kept when the view or the search changes. */
  const keep = { when, assignedTo: params.assignedTo, type: params.type, q: params.q };
  const href = (over: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keep, ...over })) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `/appointments?${query}` : "/appointments";
  };

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
              href={href({ when: tab.key })}
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
          keep={{ when, assignedTo: params.assignedTo, type: params.type }}
          filtered={Boolean(params.q || params.assignedTo || params.type)}
          resetLabel={t("list.resetAll")}
        />

        {/*
          Whose appointments, and of what kind.

          Plain links rather than a form, because the office wants one person's
          day and then another's, and a link is one press. "Their appointments"
          on the team page comes straight here.
        */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="flex flex-wrap items-center gap-1">
            <span className="label !mb-0">{t("appointments.assignedTo")}</span>
            <Link
              href={href({ assignedTo: undefined })}
              prefetch={false}
              className={`btn !px-2 !py-0.5 !text-xs ${
                params.assignedTo ? "btn-secondary" : "btn-primary"
              }`}
            >
              {t("appointments.anybody")}
            </Link>
            {team.map((member) => (
              <Link
                key={member.id}
                href={href({ assignedTo: member.id })}
                prefetch={false}
                className={`btn !px-2 !py-0.5 !text-xs ${
                  params.assignedTo === member.id ? "btn-primary" : "btn-secondary"
                }`}
              >
                {member.name}
              </Link>
            ))}
            <Link
              href={href({ assignedTo: "nobody" })}
              prefetch={false}
              className={`btn !px-2 !py-0.5 !text-xs ${
                params.assignedTo === "nobody" ? "btn-primary" : "btn-secondary"
              }`}
            >
              {t("appointments.nobody")}
            </Link>
          </span>

          <span className="flex flex-wrap items-center gap-1">
            <span className="label !mb-0">{t("appointments.type")}</span>
            <Link
              href={href({ type: undefined })}
              prefetch={false}
              className={`btn !px-2 !py-0.5 !text-xs ${
                params.type ? "btn-secondary" : "btn-primary"
              }`}
            >
              {t("common.all")}
            </Link>
            {KINDS.map((kind) => (
              <Link
                key={kind}
                href={href({ type: kind })}
                prefetch={false}
                className={`btn !px-2 !py-0.5 !text-xs ${
                  params.type === kind ? "btn-primary" : "btn-secondary"
                }`}
              >
                {t(`appointments.type.${kind}` as MessageKey)}
              </Link>
            ))}
          </span>
        </div>

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
              <div className="sm:col-span-2">
                <label className="label" htmlFor="type">
                  {t("appointments.type")}
                </label>
                <select id="type" name="type" className="select" defaultValue="OTHER">
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`appointments.type.${kind}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="assignedToId">
                  {t("appointments.assignTo")}
                </label>
                <select id="assignedToId" name="assignedToId" className="select" defaultValue="">
                  <option value="">{t("appointments.nobody")}</option>
                  {team.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
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
                  <th>{t("appointments.type")}</th>
                  <th>{t("appointments.who")}</th>
                  <th>{t("appointments.assignedTo")}</th>
                  <th className="ctr">{t("appointments.day")}</th>
                  <th className="ctr">{t("appointments.time")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ appointment, client, lead, member }) => {
                  const asking = needsAnAnswer(appointment);
                  return (
                    <tr key={appointment.id}>
                      <td className="font-semibold">{appointment.place}</td>
                      <td className="text-xs">
                        {t(`appointments.type.${appointment.type}` as MessageKey)}
                        {appointment.type === "TIMBER" || appointment.type === "BATHROOMS_TILES" ? (
                          <div className="text-brand-graphite/60">
                            {t(`appointments.company.${appointment.type}` as MessageKey)}
                          </div>
                        ) : null}
                      </td>
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
                      <td className="text-xs">
                        {member ? (
                          <Link
                            href={href({ assignedTo: member.id })}
                            className="font-semibold hover:underline"
                            prefetch={false}
                          >
                            {member.name}
                          </Link>
                        ) : (
                          <span className="text-brand-graphite/50">{t("appointments.nobody")}</span>
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
