"use client";

import { useEffect, useState } from "react";

/**
 * A bulk button that asks twice, in the same way ConfirmButton does.
 *
 * The first press arms it: it turns red and says what it is about to do. Only
 * a press on the armed button sends the form, and it goes quiet again by
 * itself after a few seconds. Used where one press does more than it looks
 * like, such as moving a client to the bin when that also cancels their sale.
 */
export default function ArmedSubmit({
  formAction,
  label,
  confirm,
  title,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  label: string;
  confirm: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="submit"
      formAction={formAction}
      title={title}
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
      className={
        armed
          ? "btn !px-2.5 !py-1 !text-xs bg-[color:var(--color-negative)] text-white"
          : "btn btn-ghost !px-2.5 !py-1 !text-xs"
      }
    >
      {armed ? confirm : label}
    </button>
  );
}
