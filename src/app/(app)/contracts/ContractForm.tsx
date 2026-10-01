"use client";

import { baseOf, shownCode } from "@/lib/choices/lists";
import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import DateField from "@/components/DateField";
import SearchSelect from "@/components/SearchSelect";
import ScheduleBuilder, { type Row } from "./ScheduleBuilder";
import UnitPicker from "./UnitPicker";
import { standardContractName } from "@/lib/contractName";
import type { ContractFormState } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { parseAmount } from "@/lib/money";

type ContractRecord = {
  id: string;
  reference: string;
  unitId: string | null;
  clientId: string | null;
  agentId: string | null;
  contractDate: Date | null;
  kind: "SALE" | "LAND_EXCHANGE";
  kindChoice?: string | null;
  netPrice: string;
  vatRate: string;
  cashAmount: string | null;
  contractValue: string | null;
  plotDescription: string | null;
  plotReference: string | null;
  plotArea: string | null;
  scheduleType: "STANDARD" | "PERIODIC";
  periodMonths: number | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  statusChoice?: string | null;
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
  statuses = [],
  kinds = [],
  stages,
  named,
  labels,
}: {
  /** The kinds of contract from the Builder: a sale, a land exchange, and the office's own. */
  kinds?: { value: string; label: string }[];
  /** The installment stages from the Builder, for the schedule. */
  stages?: { label: string; labelEl: string }[];
  named?: Record<string, { label: string; labelEl: string }>;
  /** The statuses as the office has them in the Builder, for an edit. */
  statuses?: { value: string; label: string }[];
  action: (prev: ContractFormState, formData: FormData) => Promise<ContractFormState>;
  contract?: ContractRecord;
  rows: Row[];
  /** With the building and the number, which the standard name is made from. */
  units: { id: string; label: string; building?: string; code?: string }[];
  clients: { id: string; label: string; firstName?: string; lastName?: string }[];
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
  const [state, formAction, pending] = useActionState(action, undefined);
  const [netPrice, setNetPrice] = useState(whole(contract?.netPrice));
  const [vatRate, setVatRate] = useState(contract ? String(Number(contract.vatRate)) : "19");
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
  /* What was picked, which may be the office's own kind, and the built in kind it counts as. */
  const [picked, setPicked] = useState<string>(contract ? shownCode(contract.kind, contract.kindChoice) : "SALE");
  const kind: "SALE" | "LAND_EXCHANGE" = baseOf(picked) === "LAND_EXCHANGE" ? "LAND_EXCHANGE" : "SALE";
  const [cash, setCash] = useState(whole(contract?.cashAmount ?? undefined));

  /*
   * The standard name, MA-MOQ-401, filled in as the buyer and the apartment
   * are chosen. Once somebody types their own name it is left alone; the
   * button beside the box puts the standard one back.
   */
  const [clientId, setClientId] = useState(contract?.clientId ?? defaults?.clientId ?? "");
  const [unitId, setUnitId] = useState(contract?.unitId ?? defaults?.unitId ?? "");
  const standardFor = (who: string, where: string) => {
    const person = clients.find((one) => one.id === who);
    const flat = units.find((one) => one.id === where);
    if (!person || !flat) return "";
    return standardContractName({
      firstName: person.firstName,
      lastName: person.lastName,
      building: flat.building,
      unit: flat.code,
    });
  };
  const [reference, setReference] = useState(
    contract?.reference ?? standardFor(contract?.clientId ?? defaults?.clientId ?? "", contract?.unitId ?? defaults?.unitId ?? ""),
  );
  const [typed, setTyped] = useState(Boolean(editing && contract?.reference));
  const standard = standardFor(clientId, unitId);
  const follow = (who: string, where: string) => {
    if (typed) return;
    const next = standardFor(who, where);
    if (next) setReference(next);
  };
  /*
   * On a sale with money received, the VAT is changed from the VAT card on the
   * contract, which credits the invoices already issued and puts the VAT paid
   * over on the next stages. Changed here it would only move the open stages
   * and leave the paid ones at the old rate.
   */
  const vatLocked = Boolean(frozen && contract && kind === "SALE");

  /** The price and the cash added up, said out loud so nobody has to do it. */
  const money = (value: string) => parseAmount(value) / 100;
  const together = money(netPrice) + money(cash);
  const fullValue =
    money(cash) > 0
      ? `${kind === "LAND_EXCHANGE" ? labels.togetherWithCash : labels.fullValue}: ${together.toLocaleString(
          "en-GB",
          { maximumFractionDigits: 2 },
        )}`
      : null;

  const chooseKind = (value: string) => {
    setPicked(value);
    if (baseOf(value) === "LAND_EXCHANGE") setVatRate("0");
    else setVatRate(contract ? String(Number(contract.vatRate)) : "19");
  };

  return (
    /*
      The form is sent by hand rather than through its action attribute.

      React empties a form after its action has run, even when the answer is
      "the installments do not add up": every field typed went back to what the
      page was opened with, and the client list, which keeps its choice in
      state, went back to Choose, so the next save came out without a buyer.
      Sending it ourselves leaves everything exactly as the user left it, so
      the message can be read, one number fixed, and the form saved again.
    */
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
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
            value={picked}
            onChange={(event) => chooseKind(event.target.value)}
            className="select"
          >
            {kinds.length > 0 ? (
              kinds.map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))
            ) : (
              <>
                <option value="SALE">{labels.kindSale}</option>
                <option value="LAND_EXCHANGE">{labels.kindLandExchange}</option>
              </>
            )}
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
          <SearchSelect
            id="clientId"
            name="clientId"
            required
            defaultValue={contract?.clientId ?? defaults?.clientId ?? ""}
            onChange={(value) => {
              setClientId(value);
              follow(value, unitId);
            }}
            choose={labels.choose}
            searchPlaceholder={labels.searchClient}
            noMatch={labels.noMatch}
            options={clients.map((c) => ({ value: c.id, label: c.label }))}
          />
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
              onChange={(event) => {
                setUnitId(event.target.value);
                follow(clientId, event.target.value);
              }}
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
        ) : null}

        <div>
          <label className="label" htmlFor="reference">
            {kind === "LAND_EXCHANGE" ? labels.contractNumber : labels.name}
          </label>
          <input
            id="reference"
            name="reference"
            required
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
              setTyped(true);
            }}
            placeholder={kind === "SALE" ? "MA-MOQ-401" : ""}
            className="input"
            data-contract-name
          />
          {kind === "SALE" ? (
            <p className="mt-1 text-xs text-brand-graphite/60">
              {labels.nameHint}
              {standard && standard !== reference ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-teal-dark hover:underline"
                    onClick={() => {
                      setReference(standard);
                      setTyped(false);
                    }}
                    data-use-standard
                  >
                    {labels.useStandard} {standard}
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
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
            readOnly={vatLocked}
            inputMode="decimal"
            placeholder="5"
            className={vatLocked ? "input bg-brand-surface text-brand-graphite/70" : "input"}
          />
          {vatLocked ? <p className="mt-1 text-xs text-brand-graphite/60">{labels.vatLocked}</p> : null}
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
              defaultValue={contract ? shownCode(contract.status, contract.statusChoice) : "ACTIVE"}
              className="select"
            >
              {statuses.length > 0 ? (
                statuses.map((one) => (
                  <option key={one.value} value={one.value}>
                    {one.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="DRAFT">{labels.statusDraft}</option>
                  <option value="ACTIVE">{labels.statusActive}</option>
                  <option value="COMPLETED">{labels.statusCompleted}</option>
                  <option value="CANCELLED">{labels.statusCancelled}</option>
                </>
              )}
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
        stages={stages}
        named={named}
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
          reservation: labels.reservationDue,
          onSigning: labels.onSigningDue,
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
        <SubmitButton pending={pending}>{labels.save}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
