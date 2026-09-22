import Link from "next/link";

/**
 * A page that is not there.
 *
 * Next.js answers a missing address with a bare "404: This page could not be
 * found", which tells the office nothing and offers them nowhere to go. A
 * record that has been deleted, a link somebody kept from before, a mistyped
 * address: all of them land here, and all of them want the same thing, which is
 * the way back to work.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-wide text-brand-graphite/60 uppercase">
        One Eleven
      </p>
      <h1 className="mt-2 text-2xl font-semibold">That page is not here</h1>
      <p className="mt-2 max-w-prose text-sm text-brand-graphite/70">
        Either the record has been deleted, or the address is not one the CRM knows. Nothing is
        broken and nothing has been lost.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          The dashboard
        </Link>
        <Link href="/clients" className="btn btn-secondary">
          Clients
        </Link>
        <Link href="/projects" className="btn btn-secondary">
          Projects
        </Link>
        <Link href="/contracts" className="btn btn-secondary">
          Contracts
        </Link>
      </div>
    </div>
  );
}
