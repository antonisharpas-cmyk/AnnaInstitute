"use client";

import { useState } from "react";

/**
 * The partner's category, and under Others the kind of partner, typed.
 *
 * Others is for whoever fits none of the categories, so on its own it says
 * little. Choosing it opens a plain box where the office types what they are,
 * a notary or a surveyor say.
 */
export default function CategoryField({
  categories,
  defaultCategory,
  defaultOther,
  labels,
}: {
  categories: { value: string; label: string }[];
  defaultCategory: string;
  defaultOther: string;
  labels: { category: string; pick: string; other: string; otherHint: string; otherPlaceholder: string };
}) {
  const [category, setCategory] = useState(defaultCategory);
  return (
    <>
      <div>
        <label className="label" htmlFor="category">
          {labels.category} *
        </label>
        <select
          id="category"
          name="category"
          required
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="select"
        >
          <option value="" disabled>
            {labels.pick}
          </option>
          {categories.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
      </div>
      {category === "OTHER" ? (
        <div className="sm:col-span-2" data-category-other>
          <label className="label" htmlFor="categoryOther">
            {labels.other} *
          </label>
          <input
            id="categoryOther"
            name="categoryOther"
            required
            defaultValue={defaultOther}
            placeholder={labels.otherPlaceholder}
            className="input"
            autoComplete="off"
            maxLength={80}
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.otherHint}</p>
        </div>
      ) : null}
    </>
  );
}
