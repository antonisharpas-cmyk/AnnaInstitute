import Logo from "@/components/Logo";
import { companyDetails } from "@/lib/issuer";
import { LINK_DAYS } from "@/lib/priceList";

const longDay = (value: Date) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * A price list, or a campaign's files, past its 60 days. Nothing of what it
 * showed is shown: it says when it was sent and when it stopped, and how to
 * get today's, with the office's telephone and email from Settings.
 */
export default async function LinkExpired({
  what,
  sentOn,
  closedOn,
}: {
  what: "price list" | "files";
  sentOn: Date;
  closedOn: Date;
}) {
  const company = await companyDetails();
  const phone = (company.phone || company.mobile || "").trim();
  const email = company.email?.trim() ?? "";
  const priceList = what === "price list";
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <Logo width={150} />
      <div className="mt-8 rounded-lg border border-brand-line bg-white p-6 shadow-sm" data-link-expired>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal-dark">
          {priceList ? "Price list expired" : "Link expired"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">
          {priceList ? "This price list is no longer valid" : "These files are no longer available here"}
        </h1>
        <p className="mt-3 text-sm text-brand-graphite/80">
          {priceList
            ? `Prices and availability change often, so every price list we send is valid for ${LINK_DAYS} days.`
            : `The files we send stay available for ${LINK_DAYS} days.`}{" "}
          This one was sent on {longDay(sentOn)} and expired on {longDay(closedOn)}.
        </p>
        <p className="mt-3 text-sm text-brand-graphite/80">
          {priceList
            ? "For today's prices and the apartments still available, please contact us and we will send you the latest price list straight away."
            : "Please contact us and we will send you the latest brochures, drawings and renders straight away."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="btn btn-primary">
              Call {phone}
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(priceList ? "Latest price list" : "Latest files")}`}
              className="btn btn-secondary"
            >
              Email us
            </a>
          ) : null}
        </div>
      </div>
      {company.address ? <p className="mt-6 text-center text-xs text-brand-graphite/60">{company.address}</p> : null}
    </main>
  );
}
