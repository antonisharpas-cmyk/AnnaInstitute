"use client";

import { useRef } from "react";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";

/**
 * Recording money, and asking for a change, from either side of the same deal.
 *
 * A contract is about one apartment and one buyer, so the office should not have
 * to remember which page a job lives on: a payment can be receipted from the
 * contract or from the buyer's own profile, and the form is this one either way.
 * Written once, so the two can never ask different questions or save different
 * things.
 */

/**
 * How the money arrived.
 *
 * A list rather than a text box, because "Cash", "cash", "CASH" and "Καπνός"
 * in the same column is what makes a report useless later. Anything unusual
 * goes under Other and the note beside it says what it was.
 */
export const PAYMENT_METHODS = ["CASH", "BANK", "CHEQUE", "CARD", "OTHER"] as const;

export type ScheduleLine = {
  id: string;
  seq: number;
  label: string;
  /** Formatted for reading, since the money is formatted by the caller. */
  amount: string;
  /** What this line still owes, as a plain number for the amount box. */
  owing?: string;
};

export function PaymentForm({
  action,
  lines,
  nextReceipt,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  lines: ScheduleLine[];
  /**
   * The next number in this year's run, worked out on the server. It arrives in
   * the box already typed so the ordinary receipt is numbered without anybody
   * thinking about it, and it can be typed straight over when the office is
   * writing from their own book.
   */
  nextReceipt?: string;
  labels: {
    stage: string;
    notAgainstOne: string;
    amount: string;
    date: string;
    receipt: string;
    receiptNote: string;
    method: string;
    methods: Record<string, string>;
    chooseMethod: string;
    reference?: string;
    referenceHint?: string;
    files: string;
    filesNote: string;
    fileTitle: string;
    fileTitlePlaceholder: string;
    save: string;
  };
  /** Ties the field ids apart when two of these are on one page. */
}) {
  const amount = useRef<HTMLInputElement>(null);

  /*
    Only the stages that still owe something are offered.

    A schedule of ten lines with nine receipted should not make the office read
    all ten to find the one left. A line that is settled has nothing to receipt
    against it, so it leaves the list, and money that belongs to no line goes
    against the contract itself, which is the first choice.
  */
  const owing = lines.filter((line) => line.owing === undefined || Number(line.owing) > 0);

  /*
    Picking the stage fills the amount in with what that stage still owes.

    Receipting a schedule means typing the same figure the line beside it
    already shows, ten times over, and a typo there is a contract that never
    quite reaches paid. The office can still change it: a part payment is just
    a smaller number over the top of the one offered.
  */
  const offerTheAmount = (id: string) => {
    const box = amount.current;
    if (!box) return;
    const line = lines.find((one) => one.id === id);
    if (!line?.owing) return;
    if (box.value.trim() === "" || box.dataset.offered === "yes") {
      box.value = line.owing;
      box.dataset.offered = "yes";
    }
  };

  return (
    <form
      action={action}
      className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
    >
      <div>
        <label className="label">{labels.stage}</label>
        <select
          name="installmentId"
          className="select"
          onChange={(event) => offerTheAmount(event.target.value)}
        >
          <option value="">{labels.notAgainstOne}</option>
          {owing.map((line) => (
            <option key={line.id} value={line.id}>
              {line.seq}. {line.label} . {line.amount}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{labels.amount}</label>
        <input
          ref={amount}
          name="amount"
          required
          className="input"
          onInput={(event) => {
            /* Typed over by hand, so stop offering. */
            (event.currentTarget as HTMLInputElement).dataset.offered = "no";
          }}
        />
      </div>
      <div>
        <label className="label">{labels.date}</label>
        <DateField name="paidOn" />
      </div>
      <div>
        <label className="label">{labels.method}</label>
        <select name="method" className="select" defaultValue="">
          <option value="">{labels.chooseMethod}</option>
          {/* The methods come in the office's order, its own ones from the Builder included. */}
          {Object.entries(labels.methods).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {/*
        Four things are asked and nothing else. The receipt number is given by
        the CRM in the office's own run, the invoice and the receipt are drawn
        and filed under Receipts and invoices, and both go to the client by
        email, so there is nothing to type or attach here.
      */}
      {nextReceipt ? (
        <p className="self-end text-xs text-brand-graphite/60 sm:col-span-2">
          {labels.receiptNote.replace("{number}", nextReceipt)}
        </p>
      ) : null}
      <div className="flex items-end">
        <SubmitButton>{labels.save}</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeRequestForm({
  action,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  labels: {
    name: string;
    notes: string;
    amount: string;
    files: string;
    add: string;
  };
}) {
  return (
    <form
      action={action}
      className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className="label">{labels.name}</label>
        <input name="title" required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">{labels.notes}</label>
        <textarea name="description" rows={2} className="textarea" />
      </div>
      <div>
        <label className="label">{labels.amount}</label>
        <input name="costImpact" className="input" />
      </div>
      <div>
        <label className="label">{labels.files}</label>
        <input name="files" type="file" multiple className="input !py-1.5 text-xs" />
      </div>
      <div className="flex items-end sm:col-span-2">
        <SubmitButton>{labels.add}</SubmitButton>
      </div>
    </form>
  );
}
