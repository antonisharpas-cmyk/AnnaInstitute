import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { listAppointments, needsAnAnswer, whoCanBeMet } from "@/lib/appointments";
import { whoCanGo } from "@/lib/team";
import { anyFilter, many } from "@/lib/filters";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import SearchBox from "@/components/SearchBox";
import Pick from "@/components/Pick";
import {
  answerAppointment,
  createAppointment,
  deleteAppointment,
  updateAppointment,
} from "./actions";

/**
 * Every appointment the office has, in one place.
 *
 * One list with filters over it, rather than three buttons that each drew a
 * different page: what to show, who it is on, and what kind it is. The office
 * asked for that in those words, and they were right, because three buttons
 * that change the whole table do not look like a filter and cannot be combined.
 *
 * Every row names the person it is with, the person going, and can be opened
 * and changed where it stands. An appointment that cannot be edited is an
 * appointment that gets deleted and typed in again.
 */

/** The six kinds, in the order the office listed them. */
const KINDS = ["TIMBER", "BATHROOMS_TILES", "OFFICE", "PHONE_CALL", "BUILDING", "OTHER"] as const;

/** What to show. All is the default: a list that hides things without saying so
    is the thing the office reported as a bug everywhere else. */
const SHOW = ["all", "upcoming", "done", "cancelled", "waiting"] as const;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    show?: string;
    assignedTo?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const show = (SHOW as readonly string[]).includes(params.show ?? "")
    ? (params.show as string)
    : "all";

  const [rows, people, team] = await Promise.all([
    listAppointments({
      q: params.q,
      show,
      assignedTo: params.assignedTo,
      type: params.type,
    }),
    whoCanBeMet(),
    whoCanGo(),
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

  /** The day and the time as the form wants them, for editing one. */
  const fieldValues = (at: Date) => {
    const one = new Date(at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      day: `${one.getFullYear()}-${pad(one.getMonth() + 1)}-${pad(one.getDate())}`,
      time: `${pad(one.getHours())}:${pad(one.getMinutes())}`,
    };
  };

  return (
    <>
      <PageHeader title={t("appointments.title")} subtitle={t("appointments.subtitle")} />

      <Card>
        {/*
          The filters, all three of them in the search bar, so they combine and
          so the list says plainly when it is showing less than everything.
        */}
        <SearchBox
          action="/appointments"
          query={params.q ?? ""}
          placeholder={t("appointments.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
          filtered={anyFilter(params as Record<string, string | undefined>)}
          resetLabel={t("list.resetAll")}
        >
          <Pick
            name="show"
            label={t("appointments.show")}
            chosen={show === "all" ? [] : [show]}
            anything={t("appointments.showAll")}
            choices={SHOW.filter((one) => one !== "all").map((one) => ({
              value: one,
              label: t(`appointments.show.${one}` as MessageKey),
            }))}
            only
          />

          <Pick
            name="assignedTo"
            label={t("appointments.assignedTo")}
            chosen={many(params.assignedTo ?? "")}
            anything={t("appointments.anybody")}
            choices={[
              ...team.map((member) => ({ value: member.id, label: member.name })),
              { value: "nobody", label: t("appointments.nobody") },
            ]}
          />

          <Pick
            name="type"
            label={t("appointments.type")}
            chosen={many(params.type ?? "")}
            anything={t("common.all")}
            choices={KINDS.map((kind) => ({
              value: kind,
              label: t(`appointments.type.${kind}` as MessageKey),
            }))}
          />
        </SearchBox>

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
                <TimeField id="time" name="time" defaultValue="16:00" locale={locale} />
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
                  const values = fieldValues(appointment.at);
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
                            href={`/appointments?assignedTo=${member.id}`}
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
                          <Pill tone="warn">{t("appointments.show.waiting")}</Pill>
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
                                  ? "appointments.cancelled"
                                  : "appointments.upcoming",
                            )}
                          </Pill>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {appointment.status !== "DONE" ? (
                            <form action={answerAppointment.bind(null, appointment.id, "DONE")}>
                              <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                                {t("appointments.done")}
                              </SubmitButton>
                            </form>
                          ) : null}
                          {appointment.status !== "MISSED" ? (
                            <form action={answerAppointment.bind(null, appointment.id, "MISSED")}>
                              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                                {t("appointments.cancelled")}
                              </SubmitButton>
                            </form>
                          ) : null}
                          {appointment.status !== "PLANNED" ? (
                            <form action={answerAppointment.bind(null, appointment.id, "PLANNED")}>
                              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                                {t("appointments.upcoming")}
                              </SubmitButton>
                            </form>
                          ) : null}

                          {/*
                            Changed where it stands. Everything about an
                            appointment moves: the time, the person going, the
                            kind, even the place, and until now the only way to
                            change any of it was to delete it and start again.
                          */}
                          <Disclosure
                            showLabel={t("common.edit")}
                            hideLabel={t("common.cancel")}
                            tone="secondary"
                          >
                            <form
                              action={updateAppointment.bind(null, appointment.id)}
                              className="grid w-72 gap-2 rounded border border-brand-line bg-brand-surface p-3"
                            >
                              <div>
                                <label className="label">{t("appointments.place")}</label>
                                <input
                                  name="place"
                                  defaultValue={appointment.place}
                                  className="input"
                                />
                              </div>
                              <div>
                                <label className="label">{t("appointments.type")}</label>
                                <select
                                  name="type"
                                  className="select"
                                  defaultValue={appointment.type}
                                >
                                  {KINDS.map((kind) => (
                                    <option key={kind} value={kind}>
                                      {t(`appointments.type.${kind}` as MessageKey)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label">{t("appointments.assignTo")}</label>
                                <select
                                  name="assignedToId"
                                  className="select"
                                  defaultValue={appointment.assignedToId ?? ""}
                                >
                                  <option value="">{t("appointments.nobody")}</option>
                                  {team.map((one) => (
                                    <option key={one.id} value={one.id}>
                                      {one.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label">{t("appointments.day")}</label>
                                <DateField name="day" defaultValue={values.day} />
                              </div>
                              <div>
                                <label className="label">{t("appointments.time")}</label>
                                <TimeField
                                  name="time"
                                  defaultValue={values.time}
                                  locale={locale}
                                />
                              </div>
                              <SubmitButton>{t("common.save")}</SubmitButton>
                            </form>
                          </Disclosure>

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
