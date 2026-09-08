"use client";

import { useMemo, useState } from "react";

/**
 * Adding a document to a client.
 *
 * The category comes first, because it decides what else is needed: the three
 * identification types ask for the number as well, and the type is put on the
 * end of the title so the list reads "Passport copy - Passport".
 *
 * A client who bought more than one apartment keeps different paperwork for
 * each, so the file can be tied to one of their apartments. The picker has its
 * own search because a buyer of many apartments is exactly the case it is for.
 */
const CATEGORIES: { value: string; label: string; needsNumber?: boolean }[] = [
  { value: "ID_CARD", label: "Identity Card", needsNumber: true },
  { value: "PASSPORT", label: "Passport", needsNumber: true },
  { value: "YELLOW_SLIP", label: "Yellow Slip", needsNumber: true },
  { value: "CONTRACT", label: "Contract" },
  { value: "RECEIPT", label: "Receipt" },
  { value: "CHANGE_REQUEST", label: "Adjusted Plan or Client Request" },
  { value: "OTHER", label: "Other" },
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
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idNumber: string;
  apartments: ApartmentChoice[];
  labels: {
    category: string;
    number: string;
    title: string;
    files: string;
    add: string;
    apartment: string;
    choose: string;
    anyApartment: string;
    search: string;
  };
}) {
  const [category, setCategory] = useState("ID_CARD");
  const [unitId, setUnitId] = useState("");
  const [picking, setPicking] = useState(false);
  const [term, setTerm] = useState("");

  const needsNumber = CATEGORIES.find((c) => c.value === category)?.needsNumber ?? false;
  const chosen = apartments.find((a) => a.unitId === unitId);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter((a) => `${a.projectName} ${a.code}`.toLowerCase().includes(q));
  }, [apartments, term]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="unitId" value={unitId} />

      <div>
        <label className="label" htmlFor="docCategory">
          {labels.category}
        </label>
        <select
          id="docCategory"
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="select"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {needsNumber ? (
        <div>
          <label className="label" htmlFor="docIdNumber">
            {labels.number}
          </label>
          <input
            id="docIdNumber"
            name="idNumber"
            defaultValue={idNumber}
            className="input"
            placeholder="AB1234567"
          />
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}

      {apartments.length > 0 ? (
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

      <div>
        <label className="label" htmlFor="docTitle">
          {labels.title}
        </label>
        <input id="docTitle" name="title" required className="input" placeholder="Passport copy" />
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
    </form>
  );
}
