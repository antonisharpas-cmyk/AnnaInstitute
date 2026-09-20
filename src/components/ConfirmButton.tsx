"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A delete that sits in a row of a list, made safe by asking twice.
 *
 * On a record page there is room to explain what goes with the record before
 * anything is pressed, which is what DeleteRecord does. A list has no such
 * room: the button is one of four in a narrow cell, a hand's width from Open
 * and Edit. So the first press does not delete. It arms the button, which turns
 * red and changes its word to the one that means it, and a few seconds later it
 * goes quiet again on its own. Only a press on the armed button submits.
 *
 * No browser dialog, on purpose. A dialog stops everything on the page and
 * reads like a warning from the machine rather than from the office, and on a
 * touch screen it is dismissed by the same tap that opened it.
 */
export default function ConfirmButton({
  action,
  label,
  confirm,
  title,
  blocked,
}: {
  action: () => void | Promise<void>;
  /** The quiet word, before it is armed. */
  label: string;
  /** The word that means it, once armed. */
  confirm: string;
  /** What is about to go, for the tooltip. */
  title?: string;
  /** Why this one cannot go yet, if it cannot. */
  blocked?: string | null;
}) {
  const [armed, setArmed] = useState(false);

  /* Armed only briefly: a button left waiting is a button somebody else presses. */
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  /*
    Held by something else. The button still stands in the row, because a
    column that shows a delete on some rows and nothing on others reads as a
    delete that has gone missing. It is greyed out and carries the reason.
  */
  if (blocked) {
    return (
      <button
        type="button"
        disabled
        title={blocked}
        className="btn btn-secondary !px-3 !py-1 !text-xs cursor-not-allowed opacity-45"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="inline"
      /*
        The delete redirects to the list it was pressed on and marks it as
        changed, so the row is already gone by the time the page comes back.
        The general redraw after a save would only fire a second later, on the
        same address, and take the line that says what happened down with it.
      */
      data-no-refresh="true"
      onSubmit={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
    >
      <Button armed={armed} label={label} confirm={confirm} title={title} />
    </form>
  );
}

function Button({
  armed,
  label,
  confirm,
  title,
}: {
  armed: boolean;
  label: string;
  confirm: string;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className={`btn !px-3 !py-1 !text-xs ${armed ? "btn-danger" : "btn-secondary"}`}
    >
      {pending ? <span className="spinner" /> : null}
      {armed ? confirm : label}
    </button>
  );
}
