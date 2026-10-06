"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import { parseAmount } from "@/lib/money";
import { shownCode } from "@/lib/choices/lists";

export type ExpenseRecord = {
  direction: string;
  supplier: string;
  subownerId: string | null;
  ourCompanyId: string | null;
  partyKind: string | null;
  partyId: string | null;
  partyEmail: string | null;
  partyAddress: string | null;
  reference: string | null;
  description: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  notes: string | null;
  issuedDocumentId: string | null;
};

export type SavedLine = {
  projectId: string | null;
  category: string | null;
  categoryChoice: string | null;
  categoryOther: string | null;
  vatRate: string | null;
  netAmount: string;
  vatAmount: string;
  description: string | null;
};

export type PartyChoice = { value: string; kind: string; name: string; email: string };

const day = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const plain = (value: string | null | undefined) => {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Math.abs(n) % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
};

const euros = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);

const FEES = "MANAGEMENT_FEES";
const KINDS = ["COMPANY", "CLIENT", "AGENT", "CONSTRUCTOR", "TEAM"] as const;

type Row = { category: string; other: string; projectId: string; description: string; net: string; rate: string };

/**
 * The other side of an invoice: one box. Type a name or an email and the
 * people the CRM knows come up under it, grouped: companies, clients, agents,
 * constructors, the team. Or pick "Someone else" and type their name.
 */
function PartyPicker({
  id,
  label,
  parties,
  value,
  onChange,
  expense,
  labels,
  sendsTo,
}: {
  id: string;
  label: string;
  parties: PartyChoice[];
  value: string;
  onChange: (value: string) => void;
  expense?: ExpenseRecord;
  labels: Record<string, string>;
  /** On money we charge, the invoice is emailed to them: say where. */
  sendsTo: boolean;
}) {
  const picked = parties.find((one) => one.value === value);
  const other = value === "OTHER";
  const shownName = picked ? picked.name : other ? labels.partyOTHER : "";
  const [query, setQuery] = useState(shownName);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  /* The box cannot be left on words that are not a choice. */
  useEffect(() => {
    box.current?.setCustomValidity(value ? "" : labels.chooseParty);
  }, [value, labels.chooseParty]);

  const words = query.trim().toLowerCase();
  const typing = open && words !== shownName.toLowerCase();
  const found = useMemo(
    () => (typing && words ? parties.filter((one) => `${one.name} ${one.email}`.toLowerCase().includes(words)) : parties).slice(0, 60),
    [typing, words, parties],
  );
  const options = [...KINDS.flatMap((kind) => found.filter((one) => one.kind === kind)), { value: "OTHER", kind: "OTHER", name: labels.partyOTHER, email: "" }];

  const choose = (one: PartyChoice) => {
    onChange(one.value);
    setQuery(one.value === "OTHER" ? labels.partyOTHER : one.name);
    setOpen(false);
  };

  return (
    <div data-party-picker className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input type="hidden" name="party" value={value} />
      <input
        ref={box}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        required
        value={query}
        placeholder={labels.findParty}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((n) => Math.min(n + 1, options.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((n) => Math.max(n - 1, 0));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (options[active]) choose(options[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="select"
      />
      {open ? (
        <ul
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded border border-brand-line bg-[color:var(--color-brand-paper)] py-1 text-sm shadow-lg"
          data-party-list
        >
          {options.map((one, n) => {
            const head = n === 0 || options[n - 1].kind !== one.kind;
            return (
              <li key={one.value}>
                {head && one.kind !== "OTHER" ? (
                  <div className="px-3 pb-0.5 pt-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-brand-graphite/50">{labels[`party${one.kind}`]}</div>
                ) : null}
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(one)}
                  onMouseEnter={() => setActive(n)}
                  className={`block w-full px-3 py-1 text-left ${n === active ? "bg-brand-surface" : ""} ${one.kind === "OTHER" ? "mt-1 border-t border-brand-line pt-1.5 font-semibold" : ""}`}
                  data-party-option={one.value}
                >
                  {one.name}
                  {one.email ? <span className="ml-2 text-xs text-brand-graphite/50">{one.email}</span> : null}
                </button>
              </li>
            );
          })}
          {typing && words && found.length === 0 ? <li className="px-3 py-1 text-xs text-brand-graphite/60">{labels.noPartyFound}</li> : null}
        </ul>
      ) : null}

      {other ? (
        <div className="mt-2 space-y-2 rounded border border-brand-line bg-brand-surface p-2" data-party-typed>
          <input name="partyName" required defaultValue={expense?.partyKind === "OTHER" ? expense.supplier : ""} placeholder={labels.partyName} aria-label={labels.partyName} className="input" />
          <input name="partyEmail" type="email" defaultValue={expense?.partyEmail ?? ""} placeholder={labels.partyEmail} aria-label={labels.partyEmail} className="input" />
          <input name="partyAddress" defaultValue={expense?.partyAddress ?? ""} placeholder={labels.partyAddress} aria-label={labels.partyAddress} className="input" />
        </div>
      ) : null}

      {sendsTo && picked ? (
        <p className={`mt-1 text-xs ${picked.email ? "text-brand-graphite/60" : "text-[color:var(--color-negative)]"}`}>
          {picked.email ? `${labels.sentTo} ${picked.email}` : labels.partyNoEmail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * An invoice under Company, either way round.
 *
 * "We charge someone": money coming in. From one of our companies, One Eleven
 * unless another is chosen, to anybody: a company, a client, an agent, a
 * constructor, the team, or somebody typed by name. A line for each thing
 * charged, each with its amount and its VAT; management fees for several
 * developments are ticked, a line each. The number is given by the CRM, and
 * saving draws the invoice and emails it.
 *
 * "We received an invoice": money going out. From whoever sent it, to which of
 * our companies, their own number and their invoice itself.
 */
export default function ExpenseForm({
  action,
  expense,
  projects,
  ourCompanies,
  parties,
  categories,
  cancelHref,
  labels,
  lines: savedLines = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  expense?: ExpenseRecord;
  lines?: SavedLine[];
  projects: { id: string; name: string }[];
  ourCompanies: { id: string; name: string }[];
  parties: PartyChoice[];
  categories: { value: string; label: string }[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const locked = Boolean(expense?.issuedDocumentId && expense.direction === "OUT");
  const [direction, setDirection] = useState(expense?.direction === "OUT" ? "OUT" : expense ? "IN" : "OUT");
  const out = direction === "OUT";
  const [party, setParty] = useState(
    expense
      ? expense.partyKind && expense.partyKind !== "OTHER" && expense.partyId
        ? `${expense.partyKind}:${expense.partyId}`
        : expense.subownerId
          ? `COMPANY:${expense.subownerId}`
          : "OTHER"
      : "",
  );
  const fresh = (category = FEES, projectId = ""): Row => ({ category, other: "", projectId, description: "", net: "", rate: "19" });
  const [rows, setRows] = useState<Row[]>(
    savedLines.length > 0
      ? savedLines.map((one) => ({
          category: shownCode(one.category ?? "OTHER", one.categoryChoice),
          other: one.categoryOther ?? "",
          projectId: one.projectId ?? "NONE",
          description: one.description ?? "",
          net: plain(one.netAmount),
          rate: one.vatRate !== null && one.vatRate !== undefined ? plain(one.vatRate) : "19",
        }))
      : [fresh()],
  );
  const setRow = (i: number, change: Partial<Row>) => setRows((was) => was.map((one, n) => (n === i ? { ...one, ...change } : one)));

  const sums = rows.reduce(
    (a, row) => {
      const net = parseAmount(row.net);
      const vat = Math.round((net * (Number(row.rate.replace(",", ".")) || 0)) / 100);
      return { net: a.net + net, vat: a.vat + vat };
    },
    { net: 0, vat: 0 },
  );
  const defaultOurs = expense ? (expense.ourCompanyId ?? "") : (ourCompanies[0]?.id ?? "");

  const ours = (id: string, label: string) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} name="ourCompanyId" defaultValue={defaultOurs} className="select" data-our-company>
        {ourCompanies.map((one) => (
          <option key={one.id || "oneeleven"} value={one.id}>
            {one.name}
          </option>
        ))}
      </select>
    </div>
  );
  const theirs = (label: string) => (
    <PartyPicker id="party" label={label} parties={parties} value={party} onChange={setParty} expense={expense} labels={labels} sendsTo={out} />
  );

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
        {/* From and To: our company on one side, anybody on the other. */}
        <div className="grid gap-3 sm:grid-cols-2" data-from-to>
          {out ? ours("ourCompanyFrom", labels.from) : theirs(labels.from)}
          {out ? theirs(labels.to) : ours("ourCompanyTo", labels.to)}
        </div>

        {/* Issued on the left, due on the right, on one line. */}
        <div className="grid gap-3 sm:grid-cols-2" data-dates>
          <div>
            <label className="label" htmlFor="issueDate">
              {labels.issued}
            </label>
            <DateField
              id="issueDate"
              name="issueDate"
              defaultValue={day(expense?.issueDate ?? null) || (out ? new Date().toISOString().slice(0, 10) : "")}
            />
          </div>
          {locked ? null : (
            <div>
              <label className="label" htmlFor="dueDate">
                {labels.due}
              </label>
              <DateField id="dueDate" name="dueDate" defaultValue={day(expense?.dueDate ?? null)} />
              <p className="mt-1 text-xs text-brand-graphite/60">{labels.dueHint}</p>
            </div>
          )}
          {/* Their number, only on an invoice we received: ours is numbered by the CRM. */}
          {out ? null : (
            <div>
              <label className="label" htmlFor="reference">
                {labels.reference}
              </label>
              <input id="reference" name="reference" defaultValue={expense?.reference ?? ""} className="input" />
              <p className="mt-1 text-xs text-brand-graphite/60">{labels.referenceHint}</p>
            </div>
          )}
        </div>

        {/* The lines: what each is for, its development, its amount and its VAT. */}
        <div className="space-y-2 rounded border border-brand-line bg-brand-surface p-3" data-lines>
          <p className="text-sm font-semibold">{labels.linesTitle}</p>
          {rows.map((row, i) => {
            const net = parseAmount(row.net);
            const vat = Math.round((net * (Number(row.rate.replace(",", ".")) || 0)) / 100);
            return (
              <div key={i} className="space-y-2 border-b border-brand-line pb-2 last:border-b-0" data-line-row>
                <div className="grid items-end gap-2 sm:grid-cols-[1.1fr_1.1fr_1.6fr]">
                  <div>
                    <label className="label">{labels.category}</label>
                    <select
                      name="lineCategory"
                      value={row.category}
                      onChange={(event) => setRow(i, { category: event.target.value })}
                      className="select"
                    >
                      {categories.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {/* Kept in step with the other lines, shown only for Other. */}
                    <input
                      name="lineCategoryOther"
                      value={row.other}
                      onChange={(event) => setRow(i, { other: event.target.value })}
                      required={row.category === "OTHER"}
                      hidden={row.category !== "OTHER"}
                      placeholder={labels.otherPlaceholder}
                      aria-label={labels.otherPlaceholder}
                      className="input mt-1"
                    />
                  </div>
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
                      <option value="NONE">{labels.noProject}</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{labels.description}</label>
                    <input
                      name="lineDescription"
                      value={row.description}
                      onChange={(event) => setRow(i, { description: event.target.value })}
                      placeholder={out ? labels.descriptionExample : labels.lineWordsHint}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid items-end gap-2 sm:grid-cols-[1fr_0.6fr_1fr_1fr_auto]">
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
                    <label className="label">{labels.vatRate}</label>
                    <input
                      name="lineRate"
                      inputMode="decimal"
                      value={row.rate}
                      onChange={(event) => setRow(i, { rate: event.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <span className="label">{labels.vat}</span>
                    <div className="input bg-white">{euros(vat)}</div>
                  </div>
                  <div>
                    <span className="label">{labels.lineTotal}</span>
                    <div className="input bg-white font-semibold" data-line-total>
                      {euros(net + vat)}
                    </div>
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
              </div>
            );
          })}
          {rows.length < 12 ? (
            <button
              type="button"
              className="btn btn-secondary !px-3 !py-1 !text-xs"
              onClick={() => setRows((was) => [...was, { ...fresh(was[was.length - 1]?.category ?? FEES), rate: was[was.length - 1]?.rate || "19" }])}
              data-add-line
            >
              {labels.addLine}
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3" data-totals>
          <div>
            <span className="label">{labels.net}</span>
            <div className="input bg-brand-surface" id="netAmount">
              {euros(sums.net)}
            </div>
          </div>
          <div>
            <span className="label">{labels.vat}</span>
            <div className="input bg-brand-surface" id="vatAmount">
              {euros(sums.vat)}
            </div>
          </div>
          <div>
            <span className="label">{labels.total}</span>
            <div className="input bg-brand-surface font-semibold" id="totalAmount">
              {euros(sums.net + sums.vat)}
            </div>
          </div>
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
            {labels.theirInvoice}
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            required={!expense}
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
            className="input !py-1.5 text-xs"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.theirInvoiceNote}</p>
        </div>
      )}

      {/* Where our number comes from, just above the notes. */}
      {out ? (
        <p className="text-xs text-brand-graphite/60" data-numbered-note>
          {expense?.reference ? `${labels.ourNumber} ${expense.reference}` : labels.numberedByCrm}
        </p>
      ) : null}

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
