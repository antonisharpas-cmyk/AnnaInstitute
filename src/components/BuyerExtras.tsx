"use client";

import { useState } from "react";
import DateField from "@/components/DateField";

/*
 * The two things a client can have beyond themselves: a second buyer, when the
 * apartment is in two names, and a bank, when a loan pays for it. The same
 * boxes on the new client form and on the client's own page, so the two can
 * never ask different questions.
 */

export type SecondBuyerValues = {
  secondFirstName?: string | null;
  secondLastName?: string | null;
  secondEmail?: string | null;
  secondPhone?: string | null;
  secondIdType?: string | null;
  secondIdNumber?: string | null;
  secondAddress?: string | null;
  secondCountry?: string | null;
  secondBirthDate?: string | null;
  secondRelation?: string | null;
};

export type LoanValues = {
  loan?: boolean;
  loanBank?: string | null;
  loanContact?: string | null;
  loanEmail?: string | null;
  loanPhone?: string | null;
  loanNotes?: string | null;
};

export type ExtrasLabels = {
  name: string;
  surname: string;
  email: string;
  phone: string;
  idType: string;
  idNumber: string;
  country: string;
  address: string;
  birthDate: string;
  notRecorded: string;
  relation: string;
  relationHint: string;
  secondToggle: string;
  secondHint: string;
  loanToggle: string;
  loanHint: string;
  bank: string;
  bankHint: string;
  contact: string;
  contactHint: string;
  loanEmail: string;
  loanEmailHint: string;
  loanPhone: string;
  loanNotes: string;
};

function Box({
  label,
  name,
  value,
  type = "text",
  required,
  placeholder,
  wide,
}: {
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

/** The second buyer's own details. */
export function SecondBuyerFields({
  values,
  idTypes,
  labels,
}: {
  values?: SecondBuyerValues;
  idTypes: { value: string; label: string }[];
  labels: ExtrasLabels;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-second-buyer-fields>
      <Box label={labels.name} name="secondFirstName" value={values?.secondFirstName} required />
      <Box label={labels.surname} name="secondLastName" value={values?.secondLastName} required />
      <Box label={labels.email} name="secondEmail" type="email" value={values?.secondEmail} />
      <Box label={labels.phone} name="secondPhone" value={values?.secondPhone} placeholder="+357 99 000000" />
      <div>
        <label className="label" htmlFor="secondIdType">
          {labels.idType}
        </label>
        <select id="secondIdType" name="secondIdType" className="select" defaultValue={values?.secondIdType ?? ""}>
          <option value="">{labels.notRecorded}</option>
          {idTypes.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
      </div>
      <Box label={labels.idNumber} name="secondIdNumber" value={values?.secondIdNumber} />
      <div>
        <label className="label" htmlFor="secondBirthDate">
          {labels.birthDate}
        </label>
        <DateField id="secondBirthDate" name="secondBirthDate" defaultValue={values?.secondBirthDate ?? ""} />
      </div>
      <Box label={labels.relation} name="secondRelation" value={values?.secondRelation} placeholder={labels.relationHint} />
      <Box label={labels.country} name="secondCountry" value={values?.secondCountry} placeholder="Cyprus" />
      <Box label={labels.address} name="secondAddress" value={values?.secondAddress} />
    </div>
  );
}

/** The bank paying for it, and the people there to copy. */
export function LoanFields({ values, labels }: { values?: LoanValues; labels: ExtrasLabels }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-loan-fields>
      <Box label={labels.bank} name="loanBank" value={values?.loanBank} placeholder={labels.bankHint} />
      <Box label={labels.contact} name="loanContact" value={values?.loanContact} placeholder={labels.contactHint} />
      <div className="sm:col-span-2">
        <label className="label" htmlFor="loanEmail">
          {labels.loanEmail}
        </label>
        <input id="loanEmail" name="loanEmail" defaultValue={values?.loanEmail ?? ""} className="input" placeholder="loans@bank.com.cy, officer@bank.com.cy" />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.loanEmailHint}</p>
      </div>
      <Box label={labels.loanPhone} name="loanPhone" value={values?.loanPhone} />
      <Box label={labels.loanNotes} name="loanNotes" value={values?.loanNotes} />
    </div>
  );
}

/** On the new client form: two switches, each opening its boxes. */
export default function NewClientExtras({
  idTypes,
  labels,
}: {
  idTypes: { value: string; label: string }[];
  labels: ExtrasLabels;
}) {
  const [second, setSecond] = useState(false);
  const [loan, setLoan] = useState(false);
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="rounded border border-brand-line bg-brand-surface p-3">
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="hasSecondBuyer"
            checked={second}
            onChange={(event) => setSecond(event.target.checked)}
            className="mt-0.5"
            data-second-buyer-toggle
          />
          <span>
            {labels.secondToggle}
            <span className="mt-0.5 block text-xs font-normal text-brand-graphite/60">{labels.secondHint}</span>
          </span>
        </label>
        {second ? (
          <div className="mt-3">
            <SecondBuyerFields idTypes={idTypes} labels={labels} />
          </div>
        ) : null}
      </div>
      <div className="rounded border border-brand-line bg-brand-surface p-3">
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="loan"
            checked={loan}
            onChange={(event) => setLoan(event.target.checked)}
            className="mt-0.5"
            data-loan-toggle
          />
          <span>
            {labels.loanToggle}
            <span className="mt-0.5 block text-xs font-normal text-brand-graphite/60">{labels.loanHint}</span>
          </span>
        </label>
        {loan ? (
          <div className="mt-3">
            <LoanFields labels={labels} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
