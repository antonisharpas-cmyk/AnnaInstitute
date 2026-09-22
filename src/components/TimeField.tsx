"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";

/**
 * A time, typed or picked, in the office's own shorthand.
 *
 * The browser's own time control is a different shape on every machine, it is
 * narrow, and on Windows it reads as three tiny spinners. Nobody in an office
 * types 16:00 into three boxes: they say four, or four thirty, or 4pm.
 *
 * So this is a plain text box with a list of the working day beside it, every
 * quarter of an hour from seven in the morning to nine at night. Whatever is
 * typed is understood and tidied on the way out: 9 becomes 09:00, 930 becomes
 * 09:30, 4pm becomes 16:00, 4.30 pm becomes 16:30. The value handed to the
 * server is always HH:MM, which is the only thing the server knows about.
 */
const EVERY_QUARTER = (() => {
  const times: string[] = [];
  for (let hour = 7; hour <= 21; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      times.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return times;
})();

/** What somebody meant by what they typed. */
export function understand(raw: string): string {
  const text = raw.trim().toLowerCase();
  if (!text) return "";

  const pm = /p\.?m\.?$/.test(text);
  const am = /a\.?m\.?$/.test(text);
  const digits = text.replace(/[^0-9:.]/g, "").replace(/\./g, ":");

  let hour = 0;
  let minute = 0;

  if (digits.includes(":")) {
    const [h, m] = digits.split(":");
    hour = Number(h);
    minute = Number(m ?? 0);
  } else if (digits.length <= 2) {
    hour = Number(digits);
  } else {
    hour = Number(digits.slice(0, digits.length - 2));
    minute = Number(digits.slice(-2));
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** How it reads back to somebody in an English interface. */
function nicely(value: string, locale: string): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  if (locale === "el") return value;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export default function TimeField({
  defaultValue,
  locale = "en",
  className = "",
  ...rest
}: Omit<ComponentPropsWithoutRef<"input">, "type" | "defaultValue"> & {
  defaultValue?: string;
  locale?: string;
}) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [typed, setTyped] = useState(nicely(defaultValue ?? "", locale));

  return (
    <div className="relative">
      {/* What the server is given: always HH:MM, whatever was typed. */}
      <input type="hidden" name={rest.name} value={value} />
      <input
        {...rest}
        name={undefined}
        list={listId}
        inputMode="numeric"
        autoComplete="off"
        placeholder="16:00"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setValue(understand(event.target.value));
        }}
        onBlur={() => {
          const understood = understand(typed);
          setValue(understood);
          setTyped(understood ? nicely(understood, locale) : "");
        }}
        className={`input ${className}`}
      />
      <datalist id={listId}>
        {EVERY_QUARTER.map((one) => (
          <option key={one} value={nicely(one, locale)} />
        ))}
      </datalist>
    </div>
  );
}
