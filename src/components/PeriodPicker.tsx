import Link from "next/link";
import DateField from "@/components/DateField";

/**
 * The period a report covers.
 *
 * Four presets for the questions that get asked every week, and two dates for
 * the one that does not. It is a plain GET form, so a period is an address that
 * can be bookmarked or sent to somebody else.
 */
export default function PeriodPicker({
  basePath,
  period,
  from,
  to,
  labels,
  exportHref,
  scope,
}: {
  basePath: string;
  period: string;
  from?: string;
  to?: string;
  exportHref?: string;
  labels: {
    period: string;
    last12: string;
    last24: string;
    thisYear: string;
    everything: string;
    fromDate: string;
    toDate: string;
    apply: string;
    download: string;
    building: string;
    partner: string;
    everyBuilding: string;
    everyPartner: string;
    oursAlone: string;
  };
  /**
   * Whose money, and which building.
   *
   * One Eleven holds some developments with a partner company on an agreement
   * particular to that company and that building, so every figure on a report
   * can be narrowed to one such deal. Left out, the report is the whole book,
   * which is what most people want most of the time.
   */
  scope?: {
    project: string;
    partner: string;
    buildings: { id: string; name: string }[];
    partners: { id: string; name: string }[];
  };
}) {
  const presets = [
    { key: "12m", label: labels.last12 },
    { key: "24m", label: labels.last24 },
    { key: "ytd", label: labels.thisYear },
    { key: "all", label: labels.everything },
  ];

  /* The period buttons keep whatever the scope is, so choosing a year does not
     quietly put the other four buildings back on the page. */
  const keep = scope
    ? `${scope.project ? `&project=${encodeURIComponent(scope.project)}` : ""}${
        scope.partner ? `&partner=${encodeURIComponent(scope.partner)}` : ""
      }`
    : "";

  return (
    <div className="card mb-4 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="label">{labels.period}</span>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <Link
                key={preset.key}
                href={`${basePath}?period=${preset.key}${keep}`}
                className={`btn !px-3 !py-1 !text-xs ${
                  period === preset.key ? "btn-primary" : "btn-secondary"
                }`}
              >
                {preset.label}
              </Link>
            ))}
          </div>
        </div>

        <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="custom" />
          {scope ? (
            <>
              <input type="hidden" name="project" value={scope.project} />
              <input type="hidden" name="partner" value={scope.partner} />
            </>
          ) : null}
          <div>
            <label className="label" htmlFor="from">
              {labels.fromDate}
            </label>
            <DateField id="from" name="from" defaultValue={from ?? ""} className="!py-1 !text-xs" />
          </div>
          <div>
            <label className="label" htmlFor="to">
              {labels.toDate}
            </label>
            <DateField id="to" name="to" defaultValue={to ?? ""} className="!py-1 !text-xs" />
          </div>
          <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
            {labels.apply}
          </button>
        </form>

        {/*
          The deal this page is about: a development, a partner, or both. It is
          its own little form so that choosing one applies at once, and it
          carries the period with it so the answer does not silently change
          year when somebody changes building.
        */}
        {scope ? (
          <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value={period} />
            {from ? <input type="hidden" name="from" value={from} /> : null}
            {to ? <input type="hidden" name="to" value={to} /> : null}
            <div>
              <label className="label" htmlFor="project">
                {labels.building}
              </label>
              <select
                id="project"
                name="project"
                defaultValue={scope.project}
                className="select !w-44 !py-1 !text-xs"
              >
                <option value="">{labels.everyBuilding}</option>
                {scope.buildings.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="partner">
                {labels.partner}
              </label>
              <select
                id="partner"
                name="partner"
                defaultValue={scope.partner}
                className="select !w-44 !py-1 !text-xs"
              >
                <option value="">{labels.everyPartner}</option>
                <option value="ours">{labels.oursAlone}</option>
                {scope.partners.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
              {labels.apply}
            </button>
          </form>
        ) : null}

        {exportHref ? (
          <a href={exportHref} className="btn btn-secondary !px-3 !py-1 !text-xs">
            {labels.download}
          </a>
        ) : null}
      </div>
    </div>
  );
}
