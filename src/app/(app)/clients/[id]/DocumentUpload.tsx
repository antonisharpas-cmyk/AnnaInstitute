"use client";

import { useState } from "react";

/**
 * Adding a document to a client.
 *
 * The category comes first, because it decides what else is needed: the three
 * identification types ask for the number as well, and the type is put on the
 * end of the title so the list reads "Passport copy - Passport".
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

export default function DocumentUpload({
  action,
  idNumber,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idNumber: string;
  labels: { category: string; number: string; title: string; files: string; add: string };
}) {
  const [category, setCategory] = useState("ID_CARD");
  const needsNumber = CATEGORIES.find((c) => c.value === category)?.needsNumber ?? false;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
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
