import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import Logo from "@/components/Logo";
import { QR_CONSENT_TEXT } from "@/lib/qrLead";
import { sendPersonalInformation } from "./actions";

export const dynamic = "force-dynamic";

/*
  Not listed anywhere and not for search engines: it is reached from the QR
  code the office prints, and only by somebody who has the address.
*/
export const metadata: Metadata = {
  title: "One Eleven. Your details",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The page behind the QR code.
 *
 * A visitor leaves their name and a way to reach them, and becomes an enquiry
 * in Leads at once. English only, one column, large enough to fill in on a
 * phone standing in a show flat.
 */
export default async function PersonalInformationPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; missing?: string }>;
}) {
  const params = await searchParams;
  const developments = await db
    .select({ name: projects.name })
    .from(projects)
    .orderBy(asc(projects.name))
    .catch(() => [] as { name: string }[]);

  return (
    <main className="min-h-screen bg-brand-surface px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo width={150} />
        </div>

        <div className="card p-6">
          {params.sent ? (
            <div className="py-6 text-center">
              <h1 className="mb-2 text-xl font-semibold text-brand-teal-dark">Thank you</h1>
              <p className="text-sm text-brand-graphite/80">
                We have your details, and a member of the One Eleven team will be in touch with you
                shortly.
              </p>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-semibold text-brand-teal-dark">Your details</h1>
              <p className="mb-5 text-sm text-brand-graphite/75">
                Leave your details and we will contact you about our properties.
              </p>

              {params.missing ? (
                <p className="mb-4 rounded border border-[color:var(--color-negative)] bg-white px-3 py-2 text-sm text-[color:var(--color-negative)]">
                  Please give your first and last name, and an email address or a telephone number.
                </p>
              ) : null}

              <form action={sendPersonalInformation} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="firstName">First name</label>
                    <input id="firstName" name="firstName" required autoComplete="given-name" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="lastName">Last name</label>
                    <input id="lastName" name="lastName" required autoComplete="family-name" className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" autoComplete="email" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="phone">Telephone</label>
                  <input id="phone" name="phone" type="tel" autoComplete="tel" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="country">Country</label>
                  <input id="country" name="country" autoComplete="country-name" className="input" />
                </div>
                {developments.length > 0 ? (
                  <div>
                    <label className="label" htmlFor="interest">Interested in</label>
                    <select id="interest" name="interest" className="select" defaultValue="">
                      <option value="">Any of our developments</option>
                      {developments.map((one) => (
                        <option key={one.name} value={one.name}>
                          {one.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div>
                  <label className="label" htmlFor="message">Message (optional)</label>
                  <textarea id="message" name="message" rows={3} className="input" />
                </div>

                {/* Left empty by people; robots fill it in. */}
                <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="consent" className="mt-1" />
                  <span>{QR_CONSENT_TEXT}</span>
                </label>

                <button type="submit" className="btn btn-primary w-full justify-center">
                  Send my details
                </button>
                <p className="text-center text-xs text-brand-graphite/55">
                  ONE ELEVEN INVESTMENT &amp; DEVELOPING LTD, Larnaca
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
