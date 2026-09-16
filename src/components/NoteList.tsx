"use client";

import { useEffect, useState } from "react";

/**
 * The running record on an enquiry, ten at a time.
 *
 * Notes are a history, so they are read newest first and walked backwards. The
 * arrows page in the browser rather than in the address, which keeps a link to
 * an enquiry a link to the enquiry, and turns the page without the record
 * reloading around it.
 *
 * Each note carries its own small form for taking it back off the record. The
 * action itself comes from the page, since actions live on the server, and the
 * note it applies to travels in the form rather than in a function, because a
 * function cannot cross from the server into a component like this one.
 */
export type Note = {
  id: string;
  body: string;
  /** Already formatted by the server, so the two languages read correctly. */
  when: string;
  writtenBy: string | null;
};

const PER_PAGE = 10;

export default function NoteList({
  notes,
  labels,
  remove,
}: {
  notes: Note[];
  labels: { none: string; by: string; older: string; newer: string; of: string; delete: string };
  /** The action that takes a note off the record, bound to this enquiry. */
  remove: (formData: FormData) => void | Promise<void>;
}) {
  const [page, setPage] = useState(1);

  /**
   * A new note goes to the top, so the record comes back to the first page when
   * one is added. Without this, adding a note while reading page three looks
   * like nothing happened.
   */
  useEffect(() => {
    setPage(1);
  }, [notes.length]);

  const pages = Math.max(1, Math.ceil(notes.length / PER_PAGE));
  const at = Math.min(page, pages);
  const shown = notes.slice((at - 1) * PER_PAGE, at * PER_PAGE);

  if (notes.length === 0) {
    return <p className="text-sm text-brand-graphite/60">{labels.none}</p>;
  }

  return (
    <>
      <ol className="notes">
        {shown.map((note) => (
          <li key={note.id} className="note">
            <div className="notewhen">
              {note.when}
              {note.writtenBy ? (
                <span className="notewho">
                  {labels.by} {note.writtenBy}
                </span>
              ) : null}
              <form action={remove} className="ml-auto">
                <input type="hidden" name="noteId" value={note.id} />
                <button type="submit" className="notedrop" title={labels.delete}>
                  {labels.delete}
                </button>
              </form>
            </div>
            <p className="notebody">{note.body}</p>
          </li>
        ))}
      </ol>

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPage(at - 1)}
            disabled={at === 1}
            className="btn btn-secondary !px-3 !py-1 !text-xs disabled:opacity-40"
          >
            {"←"} {labels.newer}
          </button>
          <span className="text-brand-graphite/60">
            {at} {labels.of} {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage(at + 1)}
            disabled={at === pages}
            className="btn btn-secondary !px-3 !py-1 !text-xs disabled:opacity-40"
          >
            {labels.older} {"→"}
          </button>
        </div>
      ) : null}
    </>
  );
}
