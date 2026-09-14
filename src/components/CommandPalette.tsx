"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrow, IconPlus, IconSearch } from "@/components/icons";

type Hit = { title: string; subtitle: string; href: string };
type Group = { key: string; label: string; items: Hit[] };

export type PaletteLabels = {
  placeholder: string;
  hint: string;
  nothing: string;
  goTo: string;
  create: string;
  groups: Record<string, string>;
};

/**
 * The one box that finds anything.
 *
 * Control K, or a slash from anywhere that is not a form. It searches every kind
 * of record at once, and when nothing is typed it offers the places people go
 * and the things people make, so it doubles as the menu for both. Up and down
 * move, Enter opens, Escape closes, and the mouse works the same way.
 */
export default function CommandPalette({
  open,
  onClose,
  sections,
  creates,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  sections: { href: string; label: string }[];
  creates: { href: string; label: string }[];
  labels: PaletteLabels;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Group[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);

  // What the list shows with nothing typed: where to go, and what to make.
  const idle: Group[] = useMemo(
    () => [
      {
        key: "goTo",
        label: labels.goTo,
        items: sections.map((section) => ({
          title: section.label,
          subtitle: "",
          href: section.href,
        })),
      },
      {
        key: "create",
        label: labels.create,
        items: creates.map((create) => ({ title: create.label, subtitle: "", href: create.href })),
      },
    ],
    [sections, creates, labels.goTo, labels.create],
  );

  const filteredIdle: Group[] = useMemo(() => {
    if (!query.trim()) return idle;
    const needle = query.trim().toLowerCase();
    return idle
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.title.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.items.length > 0);
  }, [idle, query]);

  const groups = useMemo(() => [...filteredIdle, ...hits], [filteredIdle, hits]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      return;
    }
  }, [open]);

  // The records are searched on the server, a moment after typing stops.
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { groups: { key: string; items: Hit[] }[] };
        setHits(
          (data.groups ?? []).map((group) => ({
            ...group,
            label: labels.groups[group.key] ?? group.key,
          })),
        );
      } catch {
        // An aborted search is the normal case while somebody is still typing.
      } finally {
        setSearching(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, labels.groups]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => (flat.length === 0 ? 0 : (current + 1) % flat.length));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => (flat.length === 0 ? 0 : (current - 1 + flat.length) % flat.length));
      }
      if (event.key === "Enter") {
        const target = flat[active];
        if (target) {
          event.preventDefault();
          go(target.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, active, onClose, go]);

  if (!open) return null;

  let index = -1;

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label={labels.placeholder}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette">
        <div className="flex items-center gap-2 border-b border-brand-line px-3">
          <IconSearch size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className="!border-b-0"
          />
          {searching ? <span className="spinner text-brand-teal" /> : null}
        </div>

        <div className="palette-list">
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-brand-graphite/60">{labels.nothing}</p>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <p className="palette-group">{group.label}</p>
                {group.items.map((item) => {
                  index += 1;
                  const isActive = index === active;
                  const position = index;
                  return (
                    <button
                      key={`${group.key}-${item.href}-${item.title}`}
                      type="button"
                      data-active={isActive}
                      className="menuitem"
                      onMouseEnter={() => setActive(position)}
                      onClick={() => go(item.href)}
                    >
                      {group.key === "create" ? <IconPlus size={15} /> : <IconArrow size={15} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.title}</span>
                        {item.subtitle ? (
                          <span className="block truncate text-xs text-brand-graphite/60">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-brand-line px-3 py-2 text-xs text-brand-graphite/60">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            {labels.hint}
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">Enter</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">Esc</span>
          </span>
        </div>
      </div>
    </div>
  );
}
