"use client";

import { useEffect, useRef, useState } from "react";

/*
 * A password box with a "Make one" button.
 *
 * The password is made here, in the browser, from letters and digits that
 * cannot be mistaken for each other when read out over the phone, and shown
 * so it can be told to the person. Nothing is sent until the form is.
 */
const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => LETTERS[n % LETTERS.length]).join("");
}

export default function PasswordField({
  name = "password",
  labels,
  id,
}: {
  name?: string;
  id?: string;
  labels: { makeOne: string; show: string; hide: string; placeholder?: string };
}) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  /* Once the form is sent and cleared, the password goes from the screen too. */
  useEffect(() => {
    const form = box.current?.form;
    if (!form) return;
    const clear = () => {
      setValue("");
      setShown(false);
    };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={box}
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        minLength={8}
        required
        autoComplete="new-password"
        placeholder={labels.placeholder}
        className="input min-w-48 flex-1 font-mono"
      />
      <button
        type="button"
        className="btn btn-secondary !px-3 !py-1 !text-xs"
        onClick={() => {
          setValue(makePassword());
          setShown(true);
        }}
        data-make-password
      >
        {labels.makeOne}
      </button>
      <button type="button" className="btn btn-secondary !px-3 !py-1 !text-xs" onClick={() => setShown(!shown)}>
        {shown ? labels.hide : labels.show}
      </button>
    </div>
  );
}
