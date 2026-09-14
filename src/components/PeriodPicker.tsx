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
  };
}) {
  const presets = [
    { key: "12m", label: labels.last12 },
    { key: "24m", label: labels.last24 },
    { key: "ytd", label: labels.thisYear },
    { key: "all", label: labels.everything },
  ];

  return (
    <div className="card mb-4 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="label">{labels.period}</span>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <Link
                key={preset.key}
                href={`${basePath}?period=${preset.key}`}
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

        {exportHref ? (
          <a href={exportHref} className="btn btn-secondary !px-3 !py-1 !text-xs">
            {labels.download}
          </a>
        ) : null}
      </div>
    </div>
  );
}
