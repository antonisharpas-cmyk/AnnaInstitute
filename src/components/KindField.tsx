"use client";

import { useState } from "react";

/**
 * What kind of appointment this is, and what Other means.
 *
 * Five of the six kinds say what they are. Other says nothing, so choosing it
 * opens a box and asks: the valuer, the bank, the lawyer. The box appears only
 * for Other, because a field that is always there and usually empty is a field
 * people stop reading.
 */
export default function KindField({
  kinds,
  defaultKind = "OTHER",
  defaultOther = "",
  labels,
  id = "type",
}: {
  kinds: { value: string; label: string }[];
  defaultKind?: string;
  defaultOther?: string;
  labels: { kind: string; other: string; otherHint: string };
  /** Tells two of these apart when both are on one page. */
  id?: string;
}) {
  const [kind, setKind] = useState(defaultKind);

  return (
    <>
      <div>
        <label className="label" htmlFor={id}>
          {labels.kind}
        </label>
        <select
          id={id}
          name="type"
          className="select"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {kinds.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
      </div>

      {kind === "OTHER" ? (
        <div>
          <label className="label" htmlFor={`${id}-other`}>
            {labels.other}
          </label>
          <input
            id={`${id}-other`}
            name="typeOther"
            defaultValue={defaultOther}
            placeholder={labels.otherHint}
            className="input"
          />
        </div>
      ) : null}
    </>
  );
}
