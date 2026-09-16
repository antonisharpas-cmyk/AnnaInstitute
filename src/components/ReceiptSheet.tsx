import Logo from "@/components/Logo";

/**
 * A receipt, on screen exactly as it will be sent and printed.
 *
 * The office asked for a receipt it can check before anything leaves the
 * building, so this is a page rather than a dialog: it can be read, printed,
 * shown to somebody, and sent when it is right. The email that goes out says
 * the same things in the same order.
 *
 * One shape serves both receipts, the buyer's and the agent's, because they
 * answer the same question from opposite sides: money moved, here is what it
 * was for, and here is where that leaves us.
 */
export type ReceiptLine = { label: string; value: string };

export default function ReceiptSheet({
  title,
  number,
  on,
  toWhom,
  toAddress,
  amount,
  lines,
  totals,
  note,
  subtitle,
}: {
  title: string;
  number: string;
  on: string;
  toWhom: string;
  toAddress?: string | null;
  amount: string;
  lines: ReceiptLine[];
  totals: ReceiptLine[];
  note?: string | null;
  subtitle: string;
}) {
  return (
    <div className="statement">
      <header className="statehead">
        <div>
          <Logo width={150} />
          <p className="mt-1 text-xs text-brand-graphite/70">{subtitle}</p>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-brand-graphite/70">
            {number} . {on}
          </p>
        </div>
      </header>

      <section className="stateblock">
        <p className="font-semibold">{toWhom}</p>
        {toAddress ? <p className="text-sm text-brand-graphite/70">{toAddress}</p> : null}
      </section>

      <section className="receiptamount">
        <p className="receiptfigure">{amount}</p>
      </section>

      <section className="stateblock">
        <dl className="receiptlines">
          {lines.map((line) => (
            <div key={line.label} className="receiptline">
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="statetotals">
        {totals.map((one) => (
          <div key={one.label}>
            <p className="label">{one.label}</p>
            <p className="statefigure">{one.value}</p>
          </div>
        ))}
      </section>

      {note ? <p className="mt-4 text-xs text-brand-graphite/60">{note}</p> : null}
    </div>
  );
}
