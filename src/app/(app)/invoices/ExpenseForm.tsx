"use client";

import { useState } from "react";
import Link from "next/link";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import { parseAmount } from "@/lib/money";
import { shownCode } from "@/lib/choices/lists";

export type ExpenseRecord = {
  direction: string;
  supplier: string;
  subownerId: string | null;
  category: string;
  categoryOther: string | null;
  categoryChoice?: string | null;
  reference: string | null;
  description: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  netAmount: string;
  vatRate: string | null;
  vatAmount: string;
  totalAmount: string;
  paidAmount: string;
  projectId: string | null;
  notes: string | null;
  issuedDocumentId: string | null;
};

const day = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const plain = (value: string | null | undefined) => {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Math.abs(n) % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
};

const euros = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * An invoice under Company, either way round.
 *
 * "We charge a partner": the partner, what it is for, the amount before VAT and
 * the rate. The VAT and the total are worked out as you type, the number is
 * given by the CRM, and saving draws the invoice and emails it to the partner.
 *
 * "We received an invoice": who it is from, their own number and their PDF.
 * Saving files it and sends a copy to the company's mailbox.
 */
export default function ExpenseForm({
  action,
  expense,
  projects,
  partners,
  categories,
  cancelHref,
  labels,
  lines: savedLines = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  expense?: ExpenseRecord;
  /** An invoice for several developments: its lines as saved. */
  lines?: { projectId: string | null; netAmount: string; description: string | null }[];
  projects: { id: string; name: string }[];
  partners: { id: string; name: string; email: string | null }[];
  categories: { value: string; label: string }[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const locked = Boolean(expense?.issuedDocumentId && expense.direction === "OUT");
  const [direction, setDirection] = useState(expense?.direction === "OUT" ? "OUT" : expense ? "IN" : "OUT");
  const [category, setCategory] = useState(
    expense ? shownCode(expense.category, expense.categoryChoice) : "MANAGEMENT_FEES",
  );
  const [net, setNet] = useState(plain(expense?.netAmount));
  const [rate, setRate] = useState(
    expense?.vatRate !== null && expense?.vatRate !== undefined ? plain(expense.vatRate) : "19",
  );
  const [partnerId, setPartnerId] = useState(expense?.subownerId ?? "");

  /* Several developments on one invoice: a line each, with its own amount. */
  const [split, setSplit] = useState(savedLines.length > 1 || savedLines.some((one) => one.description));
  const [rows, setRows] = useState(
    savedLines.length > 0
      ? savedLines.map((one) => ({ projectId: one.projectId ?? "", net: plain(one.netAmount), description: one.description ?? "" }))
      : [
          { projectId: expense?.projectId ?? "", net: plain(expense?.netAmount), description: "" },
          { projectId: "", net: "", description: "" },
        ],
  );
  const setRow = (i: number, change: Partial<(typeof rows)[number]>) =>
    setRows((was) => was.map((one, n) => (n === i ? { ...one, ...change } : one)));
  const rateNumber = Number(rate.replace(",", ".")) || 0;
  const linesNet = rows.reduce((a, one) => a + parseAmount(one.net), 0);
  const linesVat = rows.reduce((a, one) => a + Math.round((parseAmount(one.net) * rateNumber) / 100), 0);

  const netCents = split ? linesNet : parseAmount(net);
  const vatCents = split ? linesVat : Math.round((netCents * rateNumber) / 100);
  const out = direction === "OUT";
  const partner = partners.find((one) => one.id === partnerId);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="direction" value={direction} />

      {/* Which way round, as two plain choices rather than a word to decode. */}
      <fieldset disabled={Boolean(expense)} className="grid gap-2 sm:grid-cols-2">
        {[
          { value: "OUT", title: labels.weCharge, hint: labels.weChargeHint },
          { value: "IN", title: labels.weReceived, hint: labels.weReceivedHint },
        ].map((one) => (
          <label
            key={one.value}
            className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm ${
              direction === one.value ? "border-brand-teal bg-brand-surface" : "border-brand-line"
            }`}
          >
            <input
              type="radio"
              name="directionChoice"
              value={one.value}
              checked={direction === one.value}
              onChange={() => setDirection(one.value)}
              className="mt-1"
            />
            <span>
              <span className="font-semibold">{one.title}</span>
              <span className="block text-xs text-brand-graphite/60">{one.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset disabled={locked} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {out ? (
            <div>
              <label className="label" htmlFor="subownerId">
                {labels.partnerTo}
              </label>
              <select
                id="subownerId"
                name="subownerId"
                required
                value={partnerId}
                onChange={(event) => setPartnerId(event.target.value)}
                className="select"
              >
                <option value="">{labels.choosePartner}</option>
                {partners.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
              {partner ? (
                <p className={`mt-1 text-xs ${partner.email ? "text-brand-graphite/60" : "text-[color:var(--color-negative)]"}`}>
                  {partner.email ? `${labels.sentTo} ${partner.email}` : labels.partnerNoEmail}
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="supplier">
                {labels.supplier}
              </label>
              <input
                id="supplier"
                name="supplier"
                required
                defaultValue={expense?.supplier ?? ""}
                className="input"
              />
              <label className="label mt-2" htmlFor="subownerIdIn">
                {labels.partnerOptional}
              </label>
              <select id="subownerIdIn" name="subownerId" defaultValue={expense?.subownerId ?? ""} className="select">
                <option value="">{labels.notAPartner}</option>
                {partners.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="category">
              {labels.category}
            </label>
            <select
              id="category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="select"
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {category === "OTHER" ? (
              <input
                name="categoryOther"
                required
                defaultValue={expense?.categoryOther ?? ""}
                placeholder={labels.otherPlaceholder}
                aria-label={labels.otherPlaceholder}
                className="input mt-2"
              />
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="description">
              {labels.description}
            </label>
            <input
              id="description"
              name="description"
              defaultValue={expense?.description ?? ""}
              placeholder={out ? labels.descriptionExample : ""}
              className="input"
            />
          </div>

          {/* Their number, only on an invoice we received: ours is numbered by the CRM. */}
          {out ? (
            <div className="self-end text-xs text-brand-graphite/60">
              {expense?.reference ? `${labels.ourNumber} ${expense.reference}` : labels.numberedByCrm}
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="reference">
                {labels.reference}
              </label>
              <input id="reference" name="reference" defaultValue={expense?.reference ?? ""} className="input" />
            </div>
          )}

          <div>
            <label className="label" htmlFor="issueDate">
              {labels.issued}
            </label>
            <DateField id="issueDate" name="issueDate" defaultValue={day(expense?.issueDate ?? null) || (out ? new Date().toISOString().slice(0, 10) : "")} />
          </div>
          {locked ? null : (
            <div>
              <label className="label" htmlFor="dueDate">
                {labels.due}
              </label>
              <DateField id="dueDate" name="dueDate" defaultValue={day(expense?.dueDate ?? null)} />
            </div>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="split"
            checked={split}
            onChange={(event) => setSplit(event.target.checked)}
            className="mt-0.5"
            data-split
          />
          <span>
            <span className="font-semibold">{labels.splitToggle}</span>
            <span className="block text-xs text-brand-graphite/60">{labels.splitHint}</span>
          </span>
        </label>

        {split ? (
          <div className="space-y-2 rounded border border-brand-line bg-brand-surface p-3" data-lines>
            {rows.map((row, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1.2fr_0.8fr_1.4fr_auto]" data-line-row>
                <div>
                  <label className="label">{labels.project}</label>
                  <select
                    name="lineProject"
                    value={row.projectId}
                    onChange={(event) => setRow(i, { projectId: event.target.value })}
                    className="select"
                    required
                  >
                    <option value="">{labels.chooseProject}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{labels.net}</label>
                  <input
                    name="lineNet"
                    inputMode="decimal"
                    required
                    value={row.net}
                    onChange={(event) => setRow(i, { net: event.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">{labels.lineWords}</label>
                  <input
                    name="lineDescription"
                    value={row.description}
                    onChange={(event) => setRow(i, { description: event.target.value })}
                    placeholder={labels.lineWordsHint}
                    className="input"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary !px-3 !py-2 !text-xs"
                  disabled={rows.length <= 1}
                  onClick={() => setRows((was) => was.filter((_, n) => n !== i))}
                >
                  {labels.removeLine}
                </button>
              </div>
            ))}
            {rows.length < 8 ? (
              <button
                type="button"
                className="btn btn-secondary !px-3 !py-1 !text-xs"
                onClick={() => setRows((was) => [...was, { projectId: "", net: "", description: "" }])}
                data-add-line
              >
                {labels.addLine}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="netAmount">
              {labels.net}
            </label>
            {split ? (
              <div className="input bg-brand-surface" id="netAmount">{euros(netCents)}</div>
            ) : (
              <input
                id="netAmount"
                name="netAmount"
                inputMode="decimal"
                required
                value={net}
                onChange={(event) => setNet(event.target.value)}
                className="input"
              />
            )}
          </div>
          <div>
            <label className="label" htmlFor="vatRate">
              {labels.vatRate}
            </label>
            <input
              id="vatRate"
              name="vatRate"
              inputMode="decimal"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <span className="label">{labels.vat}</span>
            <div className="input bg-brand-surface">{euros(vatCents)}</div>
          </div>
          <div>
            <span className="label">{labels.total}</span>
            <div className="input bg-brand-surface font-semibold">{euros(netCents + vatCents)}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="paidAmount">
              {labels.alreadyPaid}
            </label>
            <input
              id="paidAmount"
              name="paidAmount"
              inputMode="decimal"
              defaultValue={plain(expense?.paidAmount)}
              placeholder="0"
              className="input"
            />
          </div>
          {split ? null : (
            <div>
              <label className="label" htmlFor="projectId">
                {labels.project}
              </label>
              <select id="projectId" name="projectId" defaultValue={expense?.projectId ?? ""} className="select">
                <option value="">{labels.noProject}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </fieldset>

      {/* The due date can still change after the invoice is issued. */}
      {locked ? (
        <div className="max-w-xs">
          <label className="label" htmlFor="dueDate">
            {labels.due}
          </label>
          <DateField id="dueDate" name="dueDate" defaultValue={day(expense?.dueDate ?? null)} />
        </div>
      ) : null}

      {out ? null : (
        <div>
          <label className="label" htmlFor="files">
            {labels.files}
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
            className="input !py-1.5 text-xs"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.filesNote}</p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">
          {labels.notes}
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={expense?.notes ?? ""} className="textarea" />
      </div>

      {locked ? <p className="text-xs text-brand-graphite/60">{labels.lockedNote}</p> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{expense ? labels.save : out ? labels.issueAndSend : labels.saveAndSend}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
