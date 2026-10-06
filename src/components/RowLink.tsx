"use client";

import type { ReactNode } from "react";

/**
 * A table row that opens its record wherever it is clicked, not only on the
 * name in one of its cells. Links, buttons and fields inside the row keep
 * doing their own thing. It opens in a new tab, like the links in the lists.
 */
export default function RowLink({
  href,
  children,
  ...rest
}: {
  href: string;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  const open = () => window.open(href, "_blank", "noopener");
  return (
    <tr
      {...rest}
      className="rowlink"
      tabIndex={0}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea, label")) return;
        if (window.getSelection()?.toString()) return;
        open();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) open();
      }}
    >
      {children}
    </tr>
  );
}
