import { getTranslator } from "@/i18n";
import { IconCheck, IconClose, IconPlus } from "@/components/icons";
import RememberFilters from "@/components/RememberFilters";
import ColumnChooser from "@/components/ColumnChooser";
import { createSavedView, deleteSavedView, updateSavedView } from "@/app/(app)/listActions";
import type { Column, ListKey, View } from "@/lib/lists";

export type ViewsLabels = {
  all: string;
  saveAs: string;
  saveAsHint: string;
  name: string;
  everyone: string;
  save: string;
  update: string;
  reset: string;
  showAll: string;
  changed: string;
  remove: string;
  mine: string;
  shared: string;
  restored: string;
  columns: string;
  columnsHint: string;
  done: string;
  always: string;
};

/**
 * The bar of saved views over a list.
 *
 * A filter worth using twice is worth a name, so what is on screen can be kept
 * as a view and pinned here. The bar also says, out loud, when the filters have
 * been changed since the view was saved, and offers the three things somebody
 * might want at that moment: keep the change, keep it as a new view, or go back
 * to what was saved. The last line matters most: nothing here is a mode. Every
 * chip is an ordinary link, so it can be bookmarked or sent to a colleague.
 */
export default async function ViewsBar({
  list,
  views,
  query,
  currentView,
  restored,
  columns,
  hidden,
  labels,
}: {
  list: ListKey;
  views: View[];
  /** The filters on screen, tidied, so it can be compared with a view. */
  query: string;
  currentView: View | null;
  /** True when the person was sent here by their own last filters. */
  restored: boolean;
  columns: Column[];
  hidden: Set<string>;
  labels: ViewsLabels;
}) {
  // The column names are looked up here, so every list passes its own columns
  // and none of them has to translate them first.
  const { t } = await getTranslator();

  const href = (view: View) => `/${list}?${view.query ? `${view.query}&` : ""}view=${view.id}`;

  const dirty = currentView !== null && currentView.query !== query;
  const onAll = !currentView && query === "";

  return (
    <div className="viewsbar no-print">
      <RememberFilters list={list} query={query} />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {/*
          Plain links throughout this bar. Every one of them is the same list
          with a different query string, which is the one move the app router
          sometimes fetches and then declines to show. A view chip that does
          nothing when pressed would be the worst bug on the page.
        */}
        <a href={`/${list}?all=1`} className="viewchip" data-on={onAll}>
          {labels.all}
        </a>

        {views.map((view) => (
          <a
            key={view.id}
            href={href(view)}
            className="viewchip"
            data-on={currentView?.id === view.id}
            title={view.mine ? labels.mine : labels.shared}
          >
            {view.name}
            {view.mine ? null : <span className="viewchip-shared">{labels.shared}</span>}
          </a>
        ))}

        {/* Naming what is on screen. A details element, so it needs no script. */}
        <details className="viewnew">
          <summary className="viewchip viewchip-new" title={labels.saveAsHint}>
            <IconPlus size={13} />
            {labels.saveAs}
          </summary>
          <form action={createSavedView} className="viewform">
            <input type="hidden" name="list" value={list} />
            <input type="hidden" name="query" value={query} />
            <label className="label" htmlFor={`view-name-${list}`}>
              {labels.name}
            </label>
            <input
              id={`view-name-${list}`}
              name="name"
              className="input"
              placeholder={labels.saveAs}
              maxLength={60}
            />
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" name="everyone" />
              {labels.everyone}
            </label>
            <button type="submit" className="btn btn-primary mt-2 w-full !py-1 !text-xs">
              <IconCheck size={14} />
              {labels.save}
            </button>
          </form>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {restored ? (
          <span className="viewnote">
            {labels.restored}
            <a href={`/${list}?all=1`} className="underline">
              {labels.showAll}
            </a>
          </span>
        ) : null}

        {dirty && currentView ? (
          <>
            <span className="viewnote">{labels.changed}</span>
            <form action={updateSavedView}>
              <input type="hidden" name="list" value={list} />
              <input type="hidden" name="id" value={currentView.id} />
              <input type="hidden" name="query" value={query} />
              <button type="submit" className="btn btn-primary !px-2.5 !py-1 !text-xs">
                {labels.update}
              </button>
            </form>
            <a href={href(currentView)} className="btn btn-ghost !px-2.5 !py-1 !text-xs">
              {labels.reset}
            </a>
          </>
        ) : null}

        {currentView?.mine ? (
          <form action={deleteSavedView}>
            <input type="hidden" name="list" value={list} />
            <input type="hidden" name="id" value={currentView.id} />
            <button
              type="submit"
              className="iconbtn"
              title={labels.remove}
              aria-label={labels.remove}
            >
              <IconClose size={15} />
            </button>
          </form>
        ) : null}

        <ColumnChooser
          list={list}
          columns={columns.map((column) => ({
            key: column.key,
            label: t(column.label),
            fixed: Boolean(column.fixed),
          }))}
          hidden={[...hidden]}
          labels={{
            columns: labels.columns,
            hint: labels.columnsHint,
            done: labels.done,
            always: labels.always,
          }}
        />
      </div>
    </div>
  );
}
