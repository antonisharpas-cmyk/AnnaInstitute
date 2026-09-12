"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";

/**
 * A date box that opens its calendar wherever you click it.
 *
 * The browser's own picker is used, so the dates stay in the visitor's own
 * format and keyboard entry keeps working. What this adds is the behaviour
 * people expect: the whole field is the button, not the small icon at the end,
 * and the field carries a calendar mark of its own so it reads as a date rather
 * than as another text box.
 */
type Props = Omit<ComponentPropsWithoutRef<"input">, "type">;

export default function DateField({ className = "", onClick, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      {...rest}
      ref={ref}
      type="date"
      className={`input datefield ${className}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        const input = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        try {
          input?.showPicker?.();
        } catch {
          // Safari and older browsers open the picker on their own.
        }
      }}
    />
  );
}
