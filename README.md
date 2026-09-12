# One Eleven. Sales and Client Management Platform

An internal web application for a property developer: buyers, contracts, payment
schedules with Cyprus VAT, documents, agents, commissions and messaging. Only the
office has a login. Nobody outside it can sign in at all. It is completely standalone. It does not read from, touch or depend on
the client's existing website.

Built by ErgonSite. First installation: One Eleven, Larnaca.

## What works

**The office side**

* Sign in with email and password. Passwords are stored hashed with bcrypt, the
  session is a signed cookie, and every sensitive change is written to an audit log.
* English and Greek throughout, switched from the sidebar.
* Projects and units: floor, bedrooms, areas, parking, price before VAT, status.
  Prices, status and floor plans can be handled inline from the project page.
* Clients with their identification details, plus a marketing consent field that
  records whether consent exists, when it was given and how it was obtained.
* Contracts with the payment schedule and the VAT engine described below.
* Payments recorded against a stage, with receipt number and method.
* Change requests per contract, with the PDF attached, a cost and a status.
* Agents with a commission rate, commission generated per contract, commission
  payments recorded, and a running balance of what is still owed.
* Leads from the website, posted straight into the CRM by the site itself, kept
  with the page and the campaign they came from, and turned into a client record
  in one step when the office is ready.
* Dashboard: units sold and available, money scheduled, collected and outstanding,
  overdue installments, next payments due, recent payments, and a line at the top
  when enquiries are waiting.

**Documents**

* Upload to a client, a contract, an apartment or a project. Several at a time.
  PDF, images, Word, Excel, CSV and plain text, up to 20 MB each.
* Every file is served through `/api/files/[id]`, which checks the caller is
  signed in before it serves a byte. Nothing sits on a public URL, and deleting a
  document removes the file from disk as well as the row.
* Files on an apartment: floor plans, photographs, anything else. One of the floor
  plans is marked as the one shown in the units table, and that choice can be
  changed at any time.
* Files on a project: whatever belongs to the whole development rather than to one
  apartment, such as progress photographs of the building, permits and brochures.

**Sending**

* Campaigns by email, SMS, WhatsApp or Viber. Compose, attach files, choose the
  audience, see exactly who will receive it, then send.
* The audience for a client campaign is built from the consent field, never from
  everybody in the database.
* The monthly agent price list is a link to a live page rather than a file, so the
  prices an agent quotes are the prices in the system on the day they look. Links
  can expire and can be revoked.
* Every message is recorded per recipient with the provider reference or the
  error, so there is proof of what went where.

## Deliberately not here

* **Any login for people outside the office.** This is an internal tool for the
  developer's own staff. The database still carries a role column and a client
  link on the user record, so an outside role could be added later, but nothing
  creates one and no page reads one.
* Automatically sending the price list on a schedule. Today somebody presses send.
* A downloadable PDF of the price list. The live page prints cleanly, which covers
  most of it.
* Anything to do with accounting, banks, the Land Registry or the Tax Department.

## The VAT engine

This is the part that matters most, so it is worth reading.

Nothing about Cyprus VAT is written into the code. Each contract stores two bases
and two rates, and both are editable at any time:

| Field | Meaning |
| --- | --- |
| `vat_base_reduced` | the part of the price charged at the reduced rate |
| `vat_rate_reduced` | that rate, normally 5 |
| `vat_base_standard` | the part charged at the standard rate |
| `vat_rate_standard` | that rate, normally 19 |

The two bases must add up to the price before VAT. From them the system works out
a blended rate and applies it to each installment.

Installments are stored as percentages of the price before VAT, not as fixed
amounts, so a change to the price or the rate flows through the schedule by itself.

Two rules are enforced in `src/lib/vat.ts`:

1. **Changing the VAT applies the new rate to the installments that are still open.**
   One button does it, and the screen says how many installments will move.
2. **Anything already paid keeps the figures it was actually invoiced at, for ever.**
   An installment with a payment against it is locked. It is never recalculated,
   and the rate it was invoiced at stays visible next to it.

That second rule is not theoretical. Buyers often pay at 19 percent until the Tax
Department approves their reduced rate application, and the rest of the schedule
then drops to 5 percent. The seeded example contract shows exactly that situation.

Every change of price or VAT is written to `vat_changes` with who made it, the
before and after, and which installments were recalculated.

Money is handled in integer cents everywhere and only formatted for display, so
nothing is lost to floating point. Rounding uses the largest remainder method, so
the installments always add up to the contract price exactly, to the cent.

Two display styles, on purpose. Apartment prices are whole euros in practice, so
projects, apartments and the price list use `formatAmount`, which shows the cents
only when there actually are any. Contracts, installments, payments and
commissions use `formatMoney`, which always shows two decimals, because that is
where the cents are real and an accountant will be reading them.

## The opt out is real, not a sentence in a message

This was a deliberate decision and it should not be undone by accident.

* Every send checks the **suppression list** first, whatever the consent field
  says. A suppressed address or number is recorded as suppressed and nothing goes
  out. Rows only ever go into that list. Nothing in the interface takes one out.
* Every client email carries an **unsubscribe link** that works in one click with
  no login. It signs the client id with `AUTH_SECRET`, so there is no token table
  to leak and a forged link is refused.
* Every client text message carries **reply STOP to opt out**, and the reply is
  actually handled. Point the inbound webhook of the SMS.to account at:

  ```
  POST {APP_URL}/api/webhooks/sms-inbound?secret={SMSTO_CALLBACK_SECRET}
  ```

  A reply of stop, unsubscribe, cancel, διαγραφή and the other forms people
  actually type suppresses that number and marks every client record carrying it.
  Numbers are normalised first, so the same person cannot be reached through a
  differently formatted version of their own number.
* Agents are a business contact list and do not get the opt out footer. Clients
  always do.

Run the tests for the stop keywords, the number normalising and the placeholders
with `npm test`.

## Leads from the website

The website posts every enquiry straight into the CRM, so nobody has to copy an
email into a client record by hand.

```
POST {APP_URL}/api/leads
X-Api-Key: the key made in the CRM, under Leads, API access
Content-Type: application/json
```

* **The key is never stored.** Only a SHA 256 of it is kept, so a copy of the
  database is not a copy of the keys. It is shown once, on the screen where it is
  made, and it can be revoked at any time from the same page.
* **Server to server.** The endpoint sends no CORS headers and answers no browser
  preflight, because a key in page JavaScript is a key anybody can read. The
  website takes the form on its own server and posts it from there.
* **Nothing in a payload is ever followed as an instruction.** Every field is read
  by name, stripped of control characters, cut to length and stored. The whole
  body is kept as text alongside the lead, so nothing the website sends is lost
  even when we do not recognise a field.
* **A lead is not a client.** It sits in its own section with its own statuses
  until somebody in the office turns it into a client record. A ticked consent box
  on a form is recorded as exactly that, and it becomes marketing consent only
  when the office confirms it during that step.
* **Retries are safe.** The same email or phone inside ten minutes comes back as
  `200` with `duplicate: true` and nothing is stored twice, so a website that
  retries after a timeout cannot create the same enquiry three times.
* **A test that writes nothing.** Posting `{"test": true}` checks the key and
  reads the payload back without creating a lead, which is how the website
  developer proves the wiring before go live.

The page under **Leads, API access** is written to be handed to whoever looks
after the website: it carries the address, the key, the fields, every reply code
and the list of what to ask them for.

## Channels, and why nothing sends by accident

A channel that is not configured records every message as **simulated** instead of
sending it. The whole flow, including the audience, the suppression check and the
per recipient log, can be rehearsed before the accounts exist. The campaigns page
shows which channels are ready.

| Channel | Needs |
| --- | --- |
| Email | `SMTP_HOST` and `MAIL_FROM`. For mail to arrive as their own address rather than in a spam folder, SPF and DKIM records must exist on oneeleven.com.cy. Until then send from a domain we control and set `MAIL_REPLY_TO` to theirs |
| SMS | `SMSTO_API_KEY`, and a sender name registered with SMS.to |
| WhatsApp | `SMSTO_WHATSAPP_PATH`, plus a dedicated number, business verification with Meta and approved templates. Confirm the exact path with SMS.to when the account is opened |
| Viber | `SMSTO_VIBER_PATH`. Often cheaper than WhatsApp and widely used in Cyprus |

When WhatsApp or Viber is unavailable and `MESSAGING_FALLBACK_TO_SMS` is true, the
message goes by SMS instead and the log says which channel carried it.

## Requirements

* Node 20.6 or newer. Node 22 is what it was built on.
* Nothing else. No database to install while we are building.

## Setting it up on your own machine

```
npm install
copy .env.example .env.local
```

`.env.local` already points at a local database:

```
DATABASE_URL="pglite://./.localdb"
```

That is a real Postgres that lives in a folder inside the project. Nothing to
install, no server to start, and it survives restarts because it is just files on
disk. Set `AUTH_SECRET` with the command in the comment above it, choose a
`SEED_ADMIN_PASSWORD`, then:

```
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL`, which defaults to
info@ergonsite.com, and the password you put in `SEED_ADMIN_PASSWORD`. Leave that
empty and the seed generates one and prints it once.

`npm run db:seed` creates the four Magnum Opus developments with their units and
one demonstration contract. It is safe to run twice: it skips whatever already
exists. Delete the demonstration client and contract before the client sees it, or
before real data goes in.

**The one thing to know about the local database.** Only one process should have
it open at a time, so stop `npm run dev` before running `db:migrate`, `db:seed` or
`db:check`, then start it again. If you ever want to start from nothing, delete the
`.localdb` folder and run migrate and seed again.

**When anything looks broken**, run this first:

```
npm run db:check
```

It tests the connection, then the tables, then the users, and says what to do
about whatever it finds rather than printing a stack trace.

## Moving to a real Postgres later

One line in `.env.local` and nothing else:

```
DATABASE_URL="postgresql://user:password@dpg-xxxx-a.frankfurt-postgres.render.com:5432/oneeleven"
```

Then `npm run db:migrate` and `npm run db:seed` against it. Same schema, same
migrations, same SQL, because the local database is genuine Postgres compiled to
WebAssembly rather than a different engine pretending. On Render, use the External
Database URL from your laptop and the Internal one for the deployed service.

## Deploying to Render

`render.yaml` is included. Create the Postgres instance first, in Frankfurt, then
point a Web Service at this repository. The build command runs the migrations, so
a deploy brings the schema up to date by itself.

**The disk matters.** Uploaded documents are files on disk, not rows in the
database. `render.yaml` mounts a disk at `/var/data` and sets
`STORAGE_DIR=/var/data/storage`. Without that disk every deploy would throw away
every uploaded document. Do not remove it.

Set `APP_URL` to the real address of the service. It is used to build the links
inside messages, so a wrong value means broken unsubscribe links.

For a branded address such as crm.oneeleven.com.cy, the only thing needed from
whoever controls that domain is one CNAME record pointing at the Render service.
No access to their website, their hosting or their scripts is required.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm test` | the VAT, rounding, stop keyword and placeholder tests |
| `npm run db:check` | say why the database is not working, in words |
| `npm run db:generate` | write a new SQL migration after changing the schema |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | create the administrator and the sample data |
| `npm run db:studio` | browse the data in a local UI |

## How it is put together

```
src/db/schema.ts          the whole data model
src/lib/vat.ts            the VAT and installment engine, with no framework in it
src/lib/money.ts          integer cent maths and formatting
src/lib/auth.ts           sign in, session cookie, route protection
src/lib/contracts.ts      reading a contract and recalculating its schedule
src/lib/storage.ts        writing and reading uploaded files safely
src/lib/documents.ts      reading documents by what they are attached to
src/lib/uploads.ts        saving an upload and its document record
src/lib/suppression.ts    the hard stop for every send
src/lib/unsubscribe.ts    signed one click unsubscribe links
src/lib/priceList.ts      live price list links for agents
src/lib/messaging/        email through SMTP, SMS and channels through SMS.to
src/i18n/                 English and Greek wording
src/app/(app)/            the signed in office application
src/app/price-list/       the public price list page
src/app/api/files/        file serving, signed in only
src/app/api/unsubscribe/  one click unsubscribe
src/app/api/webhooks/     inbound texts, which is what makes reply STOP work
scripts/migrate.ts        applies the migrations
scripts/seed.ts           first administrator and sample data
```

Stack: Next.js 15 with the App Router, React 19, TypeScript, Tailwind CSS 4,
Drizzle ORM and Postgres. Server actions rather than a separate API layer, so
there is one codebase and no duplicated types.

## Branding

The colours are One Eleven's own, taken from their logo and their website, and
they live as tokens at the top of `src/app/globals.css`:

| Token | Colour | Where it comes from |
| --- | --- | --- |
| `--color-brand-teal` | `#4DA1B9` | the logo mark, the word One, their site buttons |
| `--color-brand-graphite` | `#4D4D4F` | the logo mark and the word Eleven |
| `--color-brand-ink` | `#121111` | their headings |
| `--color-brand-surface` | `#F9FAF9` | their page background |

The logo is `public/brand/oneeleven-logo.png`, rendered through
`src/components/Logo.tsx`. It was lifted from their website, so it is only as
sharp as a screenshot. Ask them for the original artwork and drop it in over the
top: nothing else needs to change.

## Data protection notes for whoever works on this next

The system holds identification documents and contracts. That is lawful because a
developer has to identify a buyer, not because the buyer consented, so consent is
not the basis for it and must never be treated as one. Marketing is different and
that is what the consent field on the client record is for.

Keep these four things true:

1. Campaigns to clients are built from the consent field only.
2. The suppression list is checked on every send and only ever grows.
3. Every client message carries a working opt out.
4. Files are served only through the route that checks the caller is signed in.

Host in an EU region. Keep backups on. Never log an identification number.
