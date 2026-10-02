"use client";

import { useMemo, useState } from "react";

/**
 * Adding a document to a client.
 *
 * The type comes first and nothing is chosen for you, because a form that has
 * already decided you are filing an identity card is a form that files a lot of
 * contracts as identity cards. Until a type is picked the rest of the block
 * stays out of the way; once it is picked, only the fields that type actually
 * needs appear. Identification asks for the number and never for an apartment;
 * paperwork about a sale asks for the apartment and never for a number.
 *
 * A client who bought more than one apartment keeps different paperwork for
 * each, so the file can be tied to one of their apartments. The picker has its
 * own search because a buyer of many apartments is exactly the case it is for.
 *
 * Opened from a contract there is nothing to pick: that contract is about one
 * apartment and the file is filed against it, so the block says which apartment
 * that is instead of asking. Everything else behaves identically, which is the
 * point of one component rather than two.
 */
type Kind = {
  value: string;
  label: string;
  /** Identification carries a number, and goes on the client record. */
  needsNumber?: boolean;
  /** Paperwork about a sale can name the apartment it concerns. */
  needsApartment?: boolean;
  /** What a title for this type usually looks like. */
  example: string;
};

const CATEGORIES: Kind[] = [
  { value: "ID_CARD", label: "Identity Card", needsNumber: true, example: "Identity card copy" },
  { value: "PASSPORT", label: "Passport", needsNumber: true, example: "Passport copy" },
  { value: "YELLOW_SLIP", label: "Yellow Slip", needsNumber: true, example: "Yellow slip copy" },
  { value: "CONTRACT", label: "Contract", needsApartment: true, example: "Signed contract" },
  { value: "RECEIPT", label: "Receipt", needsApartment: true, example: "Receipt for stage 2" },
  {
    value: "CHANGE_REQUEST",
    label: "Adjusted Plan or Client Request",
    needsApartment: true,
    example: "Kitchen change request",
  },
  { value: "OTHER", label: "Other", needsApartment: true, example: "Correspondence" },
];

export type ApartmentChoice = {
  unitId: string;
  code: string;
  projectName: string;
};

export default function DocumentUpload({
  action,
  idNumber,
  apartments,
  fixed,
  people,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idNumber: string;
  /**
   * The buyer and the second buyer, when the apartment is in two names: the
   * file is filed as one of theirs, and an ID number goes on that person.
   */
  people?: { value: string; label: string; idNumber: string }[];
  apartments: ApartmentChoice[];
  /** The one apartment this block files against, when there is no choice. */
  fixed?: { unitId: string; label: string } | null;
  labels: {
    category: string;
    selectOne: string;
    pickFirst: string;
    number: string;
    title: string;
    files: string;
    add: string;
    apartment: string;
    choose: string;
    anyApartment: string;
    search: string;
    whose?: string;
  };
}) {
  const [category, setCategory] = useState("");
  const [person, setPerson] = useState(people?.[0]?.value ?? "1");
  const numberOf = people?.find((one) => one.value === person)?.idNumber ?? idNumber;
  const [unitId, setUnitId] = useState(fixed?.unitId ?? "");
  const [picking, setPicking] = useState(false);
  const [term, setTerm] = useState("");

  const kind = CATEGORIES.find((c) => c.value === category) ?? null;
  const chosen = apartments.find((a) => a.unitId === unitId);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter((a) => `${a.projectName} ${a.code}`.toLowerCase().includes(q));
  }, [apartments, term]);

  // Changing the type puts back anything the previous type had asked for.
  const chooseKind = (value: string) => {
    setCategory(value);
    setPicking(false);
    if (!CATEGORIES.find((c) => c.value === value)?.needsApartment) {
      setUnitId(fixed?.unitId ?? "");
      setTerm("");
    }
  };

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="unitId" value={kind?.needsApartment ? unitId : ""} />

      {people && people.length > 1 ? (
        <div className="sm:col-span-2">
          <label className="label" htmlFor="docPerson">
            {labels.whose}
          </label>
          <select
            id="docPerson"
            name="person"
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            className="select sm:max-w-sm"
          >
            {people.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="docCategory">
          {labels.category}
        </label>
        <select
          id="docCategory"
          name="category"
          required
          value={category}
          onChange={(event) => chooseKind(event.target.value)}
          className="select"
        >
          <option value="">{labels.selectOne}</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {kind === null ? (
        <p className="self-end text-xs text-brand-graphite/60">{labels.pickFirst}</p>
      ) : null}

      {kind?.needsNumber ? (
        <div>
          <label className="label" htmlFor="docIdNumber">
            {labels.number}
          </label>
          <input
            key={person}
            id="docIdNumber"
            name="idNumber"
            defaultValue={numberOf}
            className="input"
            placeholder="AB1234567"
          />
        </div>
      ) : null}

      {kind?.needsApartment && fixed ? (
        <div className="sm:col-span-2 text-xs text-brand-graphite/65">
          {labels.apartment}: <span className="font-semibold">{fixed.label}</span>
        </div>
      ) : null}

      {kind?.needsApartment && !fixed && apartments.length > 0 ? (
        <div className="sm:col-span-2">
          <span className="label">{labels.apartment}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="btn btn-secondary !px-3 !py-1 !text-xs"
            >
              {chosen ? `${chosen.projectName} ${chosen.code}` : labels.choose}
            </button>
            {chosen ? (
              <button
                type="button"
                onClick={() => {
                  setUnitId("");
                  setTerm("");
                }}
                className="text-xs text-brand-graphite/60 underline"
              >
                {labels.anyApartment}
              </button>
            ) : null}
          </div>

          {picking ? (
            <div className="mt-2 rounded border border-brand-line bg-white p-2">
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={labels.search}
                className="input !py-1 !text-xs"
              />
              <ul className="mt-2 max-h-48 divide-y divide-brand-line overflow-y-auto text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setUnitId("");
                      setPicking(false);
                    }}
                    className="w-full px-1 py-1.5 text-left text-xs text-brand-graphite/70 hover:bg-brand-surface"
                  >
                    {labels.anyApartment}
                  </button>
                </li>
                {matches.map((a) => (
                  <li key={a.unitId}>
                    <button
                      type="button"
                      onClick={() => {
                        setUnitId(a.unitId);
                        setPicking(false);
                      }}
                      className="w-full px-1 py-1.5 text-left hover:bg-brand-surface"
                    >
                      {a.projectName} {a.code}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {kind ? (
        <>
          <div>
            <label className="label" htmlFor="docTitle">
              {labels.title}
            </label>
            <input
              id="docTitle"
              name="title"
              required
              className="input"
              placeholder={kind.example}
            />
          </div>

          <div>
            <label className="label" htmlFor="docFiles">
              {labels.files}
            </label>
            <input
              id="docFiles"
              name="files"
              type="file"
              multiple
              required
              className="input !py-1.5 text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary">
              {labels.add}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}
