"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import DateField from "@/components/DateField";
import ScheduleBuilder, { type Row } from "./ScheduleBuilder";
import type { ContractFormState } from "./actions";
import SubmitButton from "@/components/SubmitButton";

type ContractRecord = {
  id: string;
  reference: string;
  unitId: string | null;
  clientId: string | null;
  agentId: string | null;
  contractDate: Date | null;
  netPrice: string;
  vatRate: string;
  scheduleType: "STANDARD" | "PERIODIC";
  periodMonths: number | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  notes: string | null;
};

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

const whole = (value: string | undefined) => {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(n);
};

/**
 * The contract itself: a name, a date, a price, one VAT rate and a schedule.
 *
 * No apartment and no client on it, because the same contract can be put on
 * several apartments afterwards, in different buildings and to different
 * buyers. The price and the rate live in state so the schedule builder below
 * can split the money as the user types.
 */
export default function ContractForm({
  action,
  contract,
  rows,
  units,
  clients,
  agents,
  defaults,
  cancelHref,
  frozen,
  editing,
  labels,
}: {
  action: (prev: ContractFormState, formData: FormData) => Promise<ContractFormState>;
  contract?: ContractRecord;
  rows: Row[];
  units: { id: string; label: string }[];
  clients: { id: string; label: string }[];
  agents: { id: string; label: string }[];
  /** Preselected apartment and buyer, for a contract started from a client. */
  defaults?: { unitId?: string; clientId?: string };
  cancelHref: string;
  frozen?: boolean;
  editing?: boolean;
  labels: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [netPrice, setNetPrice] = useState(whole(contract?.netPrice));
  const [vatRate, setVatRate] = useState(contract ? String(Number(contract.vatRate)) : "5");

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p className="rounded border border-[color:var(--color-negative)] bg-white px-3 py-2 text-sm text-[color:var(--color-negative)]">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="clientId">
            {labels.client}
          </label>
          <select
            id="clientId"
            name="clientId"
            required
            defaultValue={contract?.clientId ?? defaults?.clientId ?? ""}
            className="select"
          >
            <option value="">{labels.choose}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="unitId">
            {labels.apartment}
          </label>
          <select
            id="unitId"
            name="unitId"
            required
            defaultValue={contract?.unitId ?? defaults?.unitId ?? ""}
            className="select"
          >
            <option value="">{labels.choose}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="reference">
            {labels.name}
          </label>
          <input
            id="reference"
            name="reference"
            required
            defaultValue={contract?.reference ?? ""}
            placeholder="Standard 5% . 200,000"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="contractDate">
            {labels.contractDate}
          </label>
          <DateField
            id="contractDate"
            name="contractDate"
            defaultValue={day(contract?.contractDate)}
          />
        </div>

        <div>
          <label className="label" htmlFor="netPrice">
            {labels.netPrice}
          </label>
          <input
            id="netPrice"
            name="netPrice"
            required
            value={netPrice}
            onChange={(e) => setNetPrice(e.target.value)}
            inputMode="decimal"
            placeholder="200000"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="agentId">
            {labels.agent}
          </label>
          <select
            id="agentId"
            name="agentId"
            defaultValue={contract?.agentId ?? ""}
            className="select"
          >
            <option value="">{labels.noAgent}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="vatRate">
            {labels.vatRate}
          </label>
          <input
            id="vatRate"
            name="vatRate"
            required
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            inputMode="decimal"
            placeholder="5"
            className="input"
          />
        </div>

        {editing ? (
          <div>
            <label className="label" htmlFor="status">
              {labels.status}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={contract?.status ?? "ACTIVE"}
              className="select"
            >
              <option value="DRAFT">{labels.statusDraft}</option>
              <option value="ACTIVE">{labels.statusActive}</option>
              <option value="COMPLETED">{labels.statusCompleted}</option>
              <option value="CANCELLED">{labels.statusCancelled}</option>
            </select>
          </div>
        ) : null}

        <div className={editing ? "" : "sm:col-span-2"}>
          <label className="label" htmlFor="notes">
            {labels.notes}
          </label>
          <input id="notes" name="notes" defaultValue={contract?.notes ?? ""} className="input" />
        </div>
      </div>

      <ScheduleBuilder
        netPrice={netPrice}
        vatRate={vatRate}
        initialRows={rows}
        initialType={contract?.scheduleType ?? "STANDARD"}
        initialPeriodMonths={contract?.periodMonths ?? null}
        frozen={frozen}
        labels={{
          title: labels.schedule,
          standard: labels.standardPlan,
          periodic: labels.periodicPlan,
          count: labels.installmentCount,
          every: labels.every,
          monthly: labels.monthly,
          quarterly: labels.quarterly,
          startDate: labels.firstDue,
          generate: labels.generate,
          stage: labels.stage,
          amount: labels.net,
          due: labels.due,
          add: labels.addLine,
          remove: labels.delete,
          total: labels.total,
          remaining: labels.remaining,
          spread: labels.spread,
          frozen: labels.scheduleFrozen,
        }}
      />

      <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{labels.save}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
