"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/actions";

export default function LocaleSwitch({ current }: { current: "en" | "el" }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex gap-1">
      {(["en", "el"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("locale", code);
            start(() => {
              void setLocale(fd);
            });
          }}
          className={[
            "rounded-full px-2.5 py-1 text-xs font-semibold uppercase",
            current === code
              ? "bg-brand-teal text-white"
              : "text-brand-graphite hover:bg-brand-teal-soft",
          ].join(" ")}
        >
          {code === "en" ? "EN" : "ΕΛ"}
        </button>
      ))}
    </div>
  );
}
