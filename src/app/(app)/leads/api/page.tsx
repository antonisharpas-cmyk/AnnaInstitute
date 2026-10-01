import Link from "next/link";
import { getTranslator } from "@/i18n";
import { listApiKeys } from "@/lib/apiKeys";
import { appUrl } from "@/lib/unsubscribe";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import CopyBox from "@/components/CopyBox";
import Disclosure from "@/components/Disclosure";
import { killApiKey, makeApiKey } from "../actions";

const FIELDS: { name: string; also: string; what: string }[] = [
  {
    name: "email",
    also: "your-email, mail",
    what: "The address they gave. Email or phone is required.",
  },
  { name: "phone", also: "tel, mobile, your-phone", what: "Their number, in any format." },
  {
    name: "name",
    also: "firstName and lastName, your-name",
    what: "One box or two, both are read.",
  },
  { name: "message", also: "comments, your-message", what: "What they wrote." },
  {
    name: "project",
    also: "development, building",
    what: "Matched against our developments by name.",
  },
  { name: "unit", also: "apartment", what: "The apartment code, when the form knows it." },
  { name: "budget", also: "priceRange", what: "Whatever the form offers." },
  { name: "language", also: "locale", what: "The language of the page, en or el." },
  { name: "country", also: "", what: "Where they are writing from." },
  { name: "form", also: "formName", what: "Which form on the site this was." },
  { name: "pageUrl", also: "url, page", what: "The page the form sat on." },
  { name: "referrer", also: "", what: "Where the visitor came from." },
  { name: "utm_source", also: "utm_medium, utm_campaign", what: "The campaign that brought them." },
  { name: "consent", also: "marketingConsent", what: "True when they ticked a marketing box." },
  { name: "consentText", also: "", what: "The exact wording of that box, worth keeping." },
];

const ANSWERS: { code: string; meaning: string }[] = [
  { code: "201", meaning: "The lead was stored. The body carries its id." },
  {
    code: "200 with duplicate true",
    meaning:
      "The same person already wrote in the last ten minutes. Nothing was stored twice, so a retry is safe.",
  },
  {
    code: "400",
    meaning: "The body was not readable, or it carried neither an email nor a phone.",
  },
  { code: "401", meaning: "The key is missing, wrong, or revoked." },
  { code: "405", meaning: "Something other than POST was used." },
  { code: "413", meaning: "The body is over 64 KB." },
  { code: "429", meaning: "More than 120 calls in a minute. Wait and send again." },
  { code: "500", meaning: "Our side broke. Retry a few times with a growing wait." },
];

export default async function LeadsApiPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const keys = await listApiKeys();
  const endpoint = `${appUrl()}/api/leads`;
  const fresh = params.key;

  const sample = `curl -X POST ${endpoint} \\
  -H "X-Api-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Maria Georgiou","email":"maria@example.com","phone":"+357 99 123456","project":"Magnum Opus Tre","message":"I would like the price list","pageUrl":"https://oneeleven.com.cy/contact","consent":true}'`;

  const testCall = `curl -X POST ${endpoint} \\
  -H "X-Api-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"test":true,"email":"test@example.com"}'`;

  return (
    <>
      <BackLink href="/leads" label={t("leads.backToLeads")} />
      <PageHeader
        title={t("leads.apiTitle")}
        subtitle={t("leads.apiIntro")}
        action={
          <Link href="/leads" className="btn btn-secondary">
            {t("leads.title")}
          </Link>
        }
      />

      {fresh ? (
        <div className="mb-4">
          <Card title={t("leads.theKey")}>
            <p className="mb-3 text-sm text-[color:var(--color-warning)]">{t("leads.keyOnce")}</p>
            <CopyBox
              value={fresh}
              copyLabel={locale === "el" ? "Αντιγραφή" : "Copy"}
              copiedLabel={locale === "el" ? "Αντιγράφηκε" : "Copied"}
            />
          </Card>
        </div>
      ) : null}

      <div className="space-y-4">
        <Card title={t("leads.endpoint")}>
          <CopyBox
            value={endpoint}
            copyLabel={locale === "el" ? "Αντιγραφή" : "Copy"}
            copiedLabel={locale === "el" ? "Αντιγράφηκε" : "Copied"}
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{t("leads.endpointNote")}</p>
          <p className="mt-3 text-xs text-brand-graphite/60">
            POST only, with the key in an X-Api-Key header and a JSON body. Server to server: the
            key belongs on the website server itself and must never appear in page JavaScript, which
            is why this endpoint answers no browser calls.
          </p>
          <pre className="mt-3 overflow-x-auto rounded border border-brand-line bg-brand-surface p-3 font-mono text-xs">
            {sample}
          </pre>
        </Card>

        <Card title={t("leads.keys")}>
          <div className="mb-4">
            <Disclosure showLabel={t("leads.newKey")} hideLabel={t("common.cancel")}>
              <form
                action={makeApiKey}
                className="flex flex-wrap items-end gap-2 rounded border border-brand-line bg-brand-surface p-3"
              >
                <div className="min-w-64 flex-1">
                  <label className="label" htmlFor="name">
                    {t("leads.keyName")}
                  </label>
                  <input
                    id="name"
                    name="name"
                    placeholder={t("leads.keyNamePlaceholder")}
                    className="input"
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  {t("leads.createKey")}
                </button>
              </form>
            </Disclosure>
          </div>

          {keys.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>{t("leads.keyPrefix")}</th>
                    <th className="ctr">{t("leads.uses")}</th>
                    <th>{t("leads.lastUsed")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td>{k.name}</td>
                      <td className="font-mono text-xs">{k.prefix}...</td>
                      <td className="ctr">{k.useCount}</td>
                      <td className="text-xs">
                        {k.lastUsedAt
                          ? new Date(k.lastUsedAt).toLocaleString(
                              locale === "el" ? "el-GR" : "en-GB",
                            )
                          : t("leads.never")}
                      </td>
                      <td>
                        <Pill tone={k.revokedAt ? "bad" : "good"}>
                          {k.revokedAt ? t("leads.revoked") : t("leads.live")}
                        </Pill>
                      </td>
                      <td>
                        {k.revokedAt ? null : (
                          <form action={killApiKey.bind(null, k.id)}>
                            <button
                              type="submit"
                              className="btn btn-secondary !px-2 !py-1 !text-xs"
                            >
                              {t("leads.revoke")}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("leads.fieldsTitle")}>
          <p className="mb-3 text-xs text-brand-graphite/60">{t("leads.fieldsNote")}</p>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Also accepted as</th>
                  <th>What it is</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((f) => (
                  <tr key={f.name}>
                    <td className="font-mono text-xs">{f.name}</td>
                    <td className="font-mono text-xs text-brand-graphite/60">{f.also}</td>
                    <td className="text-xs">{f.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t("leads.answersTitle")}>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Reply</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                {ANSWERS.map((a) => (
                  <tr key={a.code}>
                    <td className="whitespace-nowrap font-mono text-xs">{a.code}</td>
                    <td className="text-xs">{a.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t("leads.testTitle")}>
          <p className="mb-3 text-xs text-brand-graphite/60">{t("leads.testNote")}</p>
          <pre className="overflow-x-auto rounded border border-brand-line bg-brand-surface p-3 font-mono text-xs">
            {testCall}
          </pre>
        </Card>

        <Card title={t("leads.askTitle")}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-brand-graphite">
            <li>
              Post every form on the site to the address above, from their server, not from the
              browser. One call per submission.
            </li>
            <li>
              Send the key in an X-Api-Key header, kept in their server configuration, never in page
              code or in a repository.
            </li>
            <li>
              Send the fields in the table above as JSON. Anything extra is welcome and is kept with
              the lead.
            </li>
            <li>
              Always include the page address and the utm values when the visit carried them, so the
              office knows which campaign brought the lead.
            </li>
            <li>
              Send the consent box as consent true or false, with its exact wording in consentText.
              A tick is recorded, and the office decides whether it becomes marketing consent.
            </li>
            <li>
              Treat 201 and 200 as success. On 500, or on no answer, retry three times with a
              growing wait, then email the form to the office as a fallback so nothing is lost.
            </li>
            <li>
              Keep the form working if we are unreachable. The website must never show an error to a
              visitor because the CRM was down.
            </li>
            <li>
              Prove it with the test call above before go live, then send one real lead and tell
              the office to look for it in this section.
            </li>
          </ol>
        </Card>
      </div>
    </>
  );
}
