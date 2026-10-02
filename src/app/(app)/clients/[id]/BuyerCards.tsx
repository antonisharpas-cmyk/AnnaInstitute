"use client";

import { useActionState, useEffect, useState } from "react";
import { humanLabel } from "@/lib/fileLabels";
import { birthdayText } from "@/lib/buyers";
import {
  LoanFields,
  SecondBuyerFields,
  type ExtrasLabels,
  type LoanValues,
  type SecondBuyerValues,
} from "@/components/BuyerExtras";
import { removeSecondBuyer, updateLoan, updateSecondBuyer } from "../actions";

/*
 * The second buyer and the bank, on the client's own page.
 *
 * Each is its own card with its own Save, read only until Edit is pressed,
 * the way the personal details are. Saving one never touches the other or
 * the client's own details.
 */

type State = { ok: true } | { error: string } | null;

type CardLabels = ExtrasLabels & {
  edit: string;
  save: string;
  cancel: string;
  secondTitle: string;
  secondAdd: string;
  secondRemove: string;
  secondNone: string;
  loanTitle: string;
  loanNone: string;
  loanYes: string;
  sure: string;
};

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-brand-line py-2 last:border-b-0">
      <span className="label !mb-0 w-44 shrink-0">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-graphite">{title}</h2>
      {action}
    </header>
  );
}

export function SecondBuyerCard({
  clientId,
  values,
  idTypes,
  labels,
}: {
  clientId: string;
  values: SecondBuyerValues;
  idTypes: { value: string; label: string }[];
  labels: CardLabels;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<State, FormData>(updateSecondBuyer.bind(null, clientId), null);
  useEffect(() => {
    if (state && "ok" in state) setEditing(false);
  }, [state]);

  const has = Boolean(values.secondFirstName || values.secondLastName);
  const word = (value?: string | null) =>
    value ? (idTypes.find((one) => one.value === value)?.label ?? humanLabel(value)) : "";

  if (!editing) {
    return (
      <section className="card" data-second-buyer={has ? "yes" : "no"}>
        <Header
          title={labels.secondTitle}
          action={
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary !px-3 !py-1 !text-xs" data-second-buyer-edit>
              {has ? labels.edit : labels.secondAdd}
            </button>
          }
        />
        <div className="px-4 py-2">
          {has ? (
            <>
              <Row label={labels.name} value={values.secondFirstName} />
              <Row label={labels.surname} value={values.secondLastName} />
              <Row label={labels.relation} value={values.secondRelation} />
              <Row label={labels.email} value={values.secondEmail} />
              <Row label={labels.phone} value={values.secondPhone} />
              <Row label={labels.idType} value={word(values.secondIdType)} />
              <Row label={labels.idNumber} value={values.secondIdNumber} />
              <Row label={labels.birthDate} value={birthdayText(values.secondBirthDate)} />
              <Row label={labels.country} value={values.secondCountry} />
              <Row label={labels.address} value={values.secondAddress} />
              <form
                action={removeSecondBuyer.bind(null, clientId)}
                className="py-2"
                onSubmit={(event) => {
                  if (!window.confirm(labels.sure)) event.preventDefault();
                }}
              >
                <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                  {labels.secondRemove}
                </button>
              </form>
            </>
          ) : (
            <p className="py-2 text-sm text-brand-graphite/60">{labels.secondNone}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="card" data-second-buyer="editing">
      <Header title={labels.secondTitle} />
      <form action={formAction} className="space-y-3 px-4 py-3">
        <p className="text-xs text-brand-graphite/60">{labels.secondHint}</p>
        <SecondBuyerFields values={values} idTypes={idTypes} labels={labels} />
        {state && "error" in state ? (
          <p className="text-sm text-[color:var(--color-negative)]">{state.error}</p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {labels.save}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary" disabled={pending}>
            {labels.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}

export function LoanCard({
  clientId,
  values,
  labels,
}: {
  clientId: string;
  values: LoanValues;
  labels: CardLabels;
}) {
  const [editing, setEditing] = useState(false);
  const [on, setOn] = useState(Boolean(values.loan));
  const [state, formAction, pending] = useActionState<State, FormData>(updateLoan.bind(null, clientId), null);
  useEffect(() => {
    if (state && "ok" in state) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <section className="card" data-loan={values.loan ? "yes" : "no"}>
        <Header
          title={labels.loanTitle}
          action={
            <button
              type="button"
              onClick={() => {
                setOn(Boolean(values.loan));
                setEditing(true);
              }}
              className="btn btn-secondary !px-3 !py-1 !text-xs"
              data-loan-edit
            >
              {labels.edit}
            </button>
          }
        />
        <div className="px-4 py-2">
          {values.loan ? (
            <>
              <p className="py-2 text-sm font-semibold">{labels.loanYes}</p>
              <Row label={labels.bank} value={values.loanBank} />
              <Row label={labels.contact} value={values.loanContact} />
              <Row label={labels.loanEmail} value={values.loanEmail} />
              <Row label={labels.loanPhone} value={values.loanPhone} />
              <Row label={labels.loanNotes} value={values.loanNotes} />
            </>
          ) : (
            <p className="py-2 text-sm text-brand-graphite/60">{labels.loanNone}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="card" data-loan="editing">
      <Header title={labels.loanTitle} />
      <form action={formAction} className="space-y-3 px-4 py-3">
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input type="checkbox" name="loan" checked={on} onChange={(event) => setOn(event.target.checked)} className="mt-0.5" />
          <span>
            {labels.loanToggle}
            <span className="mt-0.5 block text-xs font-normal text-brand-graphite/60">{labels.loanHint}</span>
          </span>
        </label>
        {on ? <LoanFields values={values} labels={labels} /> : null}
        {state && "error" in state ? (
          <p className="text-sm text-[color:var(--color-negative)]">{state.error}</p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {labels.save}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary" disabled={pending}>
            {labels.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
