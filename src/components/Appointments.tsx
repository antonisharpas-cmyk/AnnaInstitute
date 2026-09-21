import { Card, Empty, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import {
  answerAppointment,
  createAppointment,
  deleteAppointment,
  updateAppointment,
} from "@/app/(app)/appointments/actions";

/*
 * Appointments on a person's own card.
 *
 * Three parts, in the order the office needs them. What is waiting for an
 * answer, because an appointment nobody answered for is a viewing nobody
 * followed up. What is coming up, which is why they opened the card. And what
 * has been, so the history of a buyer who has been shown four apartments is on
 * one screen.
 */

export type AppointmentRow = {
  id: string;
  place: string;
  at: Date;
  status: "PLANNED" | "DONE" | "MISSED";
};

export type AppointmentLabels = {
  title: string;
  waiting: string;
  waitingHint: string;
  next: string;
  been: string;
  none: string;
  add: string;
  place: string;
  placeHint: string;
  day: string;
  time: string;
  save: string;
  cancel: string;
  itHappened: string;
  itDidNot: string;
  statusDone: string;
  statusMissed: string;
  statusPlanned: string;
  move: string;
  remove: string;
  sure: string;
};

/** The day, as anybody says it: 21/09/2026. */
function dayOf(at: Date, locale: string): string {
  return new Date(at).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** The time, the way each language says it. */
function timeOf(at: Date, locale: string): string {
  return new Date(at).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
    hour: locale === "el" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: locale !== "el",
  });
}

/** For the boxes on the form, which want the machine's own spelling. */
function fieldValues(at: Date): { day: string; time: string } {
  const one = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${one.getFullYear()}-${pad(one.getMonth() + 1)}-${pad(one.getDate())}`,
    time: `${pad(one.getHours())}:${pad(one.getMinutes())}`,
  };
}

export function needsAnAnswer(row: AppointmentRow): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return row.status === "PLANNED" && new Date(row.at) < today;
}

export default function Appointments({
  rows,
  /** "client:abc" or "lead:abc": who these belong to. */
  with: withWhom,
  locale,
  labels,
}: {
  rows: AppointmentRow[];
  with: string;
  locale: string;
  labels: AppointmentLabels;
}) {
  const asking = rows.filter((row) => needsAnAnswer(row));
  const coming = rows.filter((row) => row.status === "PLANNED" && !needsAnAnswer(row));
  const been = rows.filter((row) => row.status !== "PLANNED");

  const when = (row: AppointmentRow) => (
    <span className="text-brand-graphite/70">
      {dayOf(row.at, locale)} . {timeOf(row.at, locale)}
    </span>
  );

  return (
    <Card title={labels.title}>
      {/* 1. Yesterday's appointments, waiting for somebody to say what happened. */}
      {asking.length > 0 ? (
        <div className="mb-4 rounded border border-[color:var(--color-warning)] bg-brand-surface p-3">
          <p className="text-sm font-semibold">{labels.waiting}</p>
          <p className="mb-2 text-xs text-brand-graphite/70">{labels.waitingHint}</p>
          <ul className="divide-y divide-brand-line text-sm">
            {asking.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{row.place}</span> {when(row)}
                </span>
                <span className="flex flex-wrap gap-1">
                  <form action={answerAppointment.bind(null, row.id, "DONE")}>
                    <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                      {labels.itHappened}
                    </SubmitButton>
                  </form>
                  <form action={answerAppointment.bind(null, row.id, "MISSED")}>
                    <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                      {labels.itDidNot}
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 2. What is coming up. */}
      <h3 className="label mb-1">{labels.next}</h3>
      {coming.length === 0 ? (
        <Empty message={labels.none} />
      ) : (
        <ul className="divide-y divide-brand-line text-sm">
          {coming.map((row) => (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{row.place}</span> {when(row)}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <Disclosure showLabel={labels.move} hideLabel={labels.cancel} tone="secondary">
                    <Form
                      action={updateAppointment.bind(null, row.id)}
                      labels={labels}
                      values={fieldValues(row.at)}
                      place={row.place}
                    />
                  </Disclosure>
                  <ConfirmButton
                    action={deleteAppointment.bind(null, row.id)}
                    label={labels.remove}
                    confirm={labels.sure}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 3. Everything that has been, with the answer that was given. */}
      {been.length > 0 ? (
        <>
          <h3 className="label mt-4 mb-1">{labels.been}</h3>
          <ul className="divide-y divide-brand-line text-sm">
            {been.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{row.place}</span> {when(row)}
                </span>
                <span className="flex items-center gap-2">
                  <Pill tone={row.status === "DONE" ? "good" : "warn"}>
                    {row.status === "DONE" ? labels.statusDone : labels.statusMissed}
                  </Pill>
                  <ConfirmButton
                    action={deleteAppointment.bind(null, row.id)}
                    label={labels.remove}
                    confirm={labels.sure}
                  />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* 4. Arranging the next one, without leaving the card. */}
      <div className="mt-3">
        <Disclosure showLabel={labels.add} hideLabel={labels.cancel}>
          <Form action={createAppointment} labels={labels} withWhom={withWhom} />
        </Disclosure>
      </div>
    </Card>
  );
}

/** The same three boxes, whether a meeting is being made or moved. */
function Form({
  action,
  labels,
  values,
  place,
  withWhom,
}: {
  action: (formData: FormData) => void | Promise<void>;
  labels: AppointmentLabels;
  values?: { day: string; time: string };
  place?: string;
  withWhom?: string;
}) {
  return (
    <form
      action={action}
      className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
    >
      {withWhom ? <input type="hidden" name="with" value={withWhom} /> : null}
      <div className="sm:col-span-3">
        <label className="label">{labels.place}</label>
        <input
          name="place"
          required
          defaultValue={place ?? ""}
          placeholder={labels.placeHint}
          className="input"
        />
      </div>
      <div>
        <label className="label">{labels.day}</label>
        <DateField name="day" required defaultValue={values?.day ?? ""} />
      </div>
      <div>
        <label className="label">{labels.time}</label>
        <input
          name="time"
          type="time"
          required
          defaultValue={values?.time ?? "16:00"}
          className="input"
        />
      </div>
      <div className="flex items-end">
        <SubmitButton>{labels.save}</SubmitButton>
      </div>
    </form>
  );
}
