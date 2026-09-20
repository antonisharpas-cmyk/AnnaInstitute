"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import DateField from "@/components/DateField";
import ScheduleBuilder, { type Row } from "./ScheduleBuilder";
import UnitPicker from "./UnitPicker";
import type { ContractFormState } from "./actions";
import SubmitButton from "@/components/SubmitButton";

type ContractRecord = {
  id: string;
  reference: string;
  unitId: string | null;
  clientId: string | null;
  agentId: string | null;
  contractDate: Date | null;
  kind: "SALE" | "LAND_EXCHANGE";
  netPrice: string;
  vatRate: string;
  cashAmount: string | null;
  contractValue: string | null;
  plotDescription: string | null;
  plotReference: string | null;
  plotArea: string | null;
  sharePercent: string | null;
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
  chosenUnitIds = [],
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
  defaults?: { unitId?: string; clientId?: string; agentId?: string };
  /** On a land exchange, the apartments already allotted to the landowner. */
  chosenUnitIds?: string[];
  cancelHref: string;
  frozen?: boolean;
  editing?: boolean;
  labels: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [netPrice, setNetPrice] = useState(whole(contract?.netPrice));
  const [vatRate, setVatRate] = useState(contract ? String(Number(contract.vatRate)) : "5");
  /**
   * A sale, or land exchanged for apartments.
   *
   * Antiparochi is a different agreement, not a sale with odd numbers: the
   * owner of the plot is paid in apartments, the VAT is whatever that
   * particular transaction attracts rather than the usual rate, and a sum of
   * cash often settles the difference. So choosing it offers nought as the rate
   * and asks for the cash, and choosing a sale puts the rate back and takes the
   * question away, which is the whole difference between the two on this form.
   */
  const [kind, setKind] = useState<"SALE" | "LAND_EXCHANGE">(contract?.kind ?? "SALE");
  const [cash, setCash] = useState(whole(contract?.cashAmount ?? undefined));

  /** The price and the cash added up, said out loud so nobody has to do it. */
  const money = (value: string) => {
    const n = Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const together = money(netPrice) + money(cash);
  const fullValue =
    money(cash) > 0
      ? `${kind === "LAND_EXCHANGE" ? labels.togetherWithCash : labels.fullValue}: ${together.toLocaleString(
          "en-GB",
          { maximumFractionDigits: 2 },
        )}`
      : null;

  const chooseKind = (value: "SALE" | "LAND_EXCHANGE") => {
    setKind(value);
    if (value === "LAND_EXCHANGE") setVatRate("0");
    else setVatRate(contract ? String(Number(contract.vatRate)) : "5");
  };

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p className="rounded border border-[color:var(--color-negative)] bg-white px-3 py-2 text-sm text-[color:var(--color-negative)]">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={kind === "LAND_EXCHANGE" ? "sm:col-span-2" : ""}>
          <label className="label" htmlFor="kind">
            {labels.kind}
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => chooseKind(event.target.value as "SALE" | "LAND_EXCHANGE")}
            className="select"
          >
            <option value="SALE">{labels.kindSale}</option>
            <option value="LAND_EXCHANGE">{labels.kindLandExchange}</option>
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">
            {kind === "LAND_EXCHANGE" ? labels.kindLandExchangeHint : labels.kindSaleHint}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="clientId">
            {/* The other side of a land exchange is not a buyer. */}
            {kind === "LAND_EXCHANGE" ? labels.landowner : labels.client}
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

        {kind === "SALE" ? (
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
        ) : (
          <div>
            <label className="label" htmlFor="sharePercent">
              {labels.sharePercent}
            </label>
            <input
              id="sharePercent"
              name="sharePercent"
              inputMode="decimal"
              defaultValue={contract?.sharePercent ? String(Number(contract.sharePercent)) : ""}
              placeholder="40"
              className="input"
            />
            <p className="mt-1 text-xs text-brand-graphite/60">{labels.sharePercentHint}</p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="reference">
            {kind === "LAND_EXCHANGE" ? labels.contractNumber : labels.name}
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
            {kind === "LAND_EXCHANGE" ? labels.agreementValue : labels.netPrice}
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

        {kind === "LAND_EXCHANGE" ? (
          /*
            The value of the agreement and the value on the deed are two
            numbers on antiparochi, and the office has to be able to record
            both. On a sale they are the same thing, so the field is not there.
          */
          <div>
            <label className="label" htmlFor="contractValue">
              {labels.contractValue}
            </label>
            <input
              id="contractValue"
              name="contractValue"
              inputMode="decimal"
              defaultValue={whole(contract?.contractValue ?? undefined)}
              placeholder="200000"
              className="input"
            />
            <p className="mt-1 text-xs text-brand-graphite/60">{labels.contractValueHint}</p>
          </div>
        ) : null}

        {kind === "SALE" ? (
          /* No agent on a land exchange: there is no sale price for a
             commission to be a percentage of, and nothing is collected. */
          <div>
            <label className="label" htmlFor="agentId">
              {labels.agent}
            </label>
            <select
              id="agentId"
              name="agentId"
              defaultValue={contract?.agentId ?? defaults?.agentId ?? ""}
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
        ) : null}

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

        {/*
          Cash belongs on both kinds, for different reasons.

          On a sale it is the part of the agreed price that is not written on
          the contract: 280,000 sold as 250,000 with 30,000 in cash. The agent
          sold a 280,000 apartment either way, so the two figures together are
          what the commission is worked out on and the form has to be able to
          hold both. On a land exchange it is the money settling the difference
          against the apartments.
        */}
        <div>
          <label className="label" htmlFor="cashAmount">
            {labels.cashAmount}
          </label>
          <input
            id="cashAmount"
            name="cashAmount"
            value={cash}
            onChange={(event) => setCash(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="input"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">
            {kind === "LAND_EXCHANGE" ? labels.cashAmountHint : labels.cashOnSaleHint}
          </p>
          {fullValue ? <p className="mt-1 text-xs font-semibold">{fullValue}</p> : null}
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

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            {kind === "LAND_EXCHANGE" ? labels.extraAgreement : labels.notes}
          </label>
          {/*
            A note on a contract is a term of the agreement, not a label: twenty
            thousand in cash, ten thousand held back until delivery, a extra
            arrangement about the roof. So it is given room to be a sentence
            rather than a line that runs off the end of a box.
          */}
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={contract?.notes ?? ""}
            placeholder={labels.notesPlaceholder}
            className="input"
          />
        </div>
      </div>

      {kind === "LAND_EXCHANGE" ? (
        <>
          {/*
            What the owner gave, and what they get for it.

            These two blocks are the agreement. Everything above them is the
            paperwork around it: who, when, what number. A sale has no plot and
            gives one apartment, so it sees neither of them.
          */}
          <fieldset className="rounded border border-brand-line bg-brand-surface p-3">
            <legend className="label px-1">{labels.thePlot}</legend>
            <p className="mb-3 text-xs text-brand-graphite/60">{labels.thePlotHint}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="label" htmlFor="plotDescription">
                  {labels.plotDescription}
                </label>
                <input
                  id="plotDescription"
                  name="plotDescription"
                  defaultValue={contract?.plotDescription ?? ""}
                  placeholder={labels.plotDescriptionPlaceholder}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="plotReference">
                  {labels.plotReference}
                </label>
                <input
                  id="plotReference"
                  name="plotReference"
                  defaultValue={contract?.plotReference ?? ""}
                  placeholder="0/1234"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="plotArea">
                  {labels.plotArea}
                </label>
                <input
                  id="plotArea"
                  name="plotArea"
                  inputMode="decimal"
                  defaultValue={contract?.plotArea ? String(Number(contract.plotArea)) : ""}
                  placeholder="1200"
                  className="input"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded border border-brand-line bg-brand-surface p-3">
            <legend className="label px-1">{labels.theirApartments}</legend>
            <p className="mb-3 text-xs text-brand-graphite/60">{labels.theirApartmentsHint}</p>
            <UnitPicker
              units={units}
              chosen={chosenUnitIds}
              labels={{
                search: labels.searchApartments,
                none: labels.noApartmentsYet,
                count: labels.apartmentsChosen,
                nothingFound: labels.nothingFound,
              }}
            />
          </fieldset>

          <p className="rounded border border-brand-line bg-brand-surface px-3 py-2 text-xs text-brand-graphite/70">
            {labels.landExchangeSchedule}
          </p>
        </>
      ) : null}

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
