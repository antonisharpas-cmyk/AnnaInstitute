import Link from "next/link";
import { getTranslator } from "@/i18n";
import { listTemplates } from "@/lib/templates";
import { BackLink, Card, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import { saveTemplate } from "../actions";

/**
 * The letters the office sends often.
 *
 * Each one is edited here in place, in both languages, and the braces are what
 * gets filled in when a campaign is written from it.
 */
export default async function TemplatesPage() {
  const { t } = await getTranslator();
  const templates = await listTemplates();

  return (
    <>
      <BackLink
        href="/campaigns"
        label={`${t("common.backTo")} ${t("nav.campaigns").toLowerCase()}`}
      />
      <PageHeader title={t("campaigns.templates")} subtitle={t("campaigns.templatesNote")} />

      <div className="mb-4">
        <Card title={t("campaigns.placeholders")}>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            <li>
              <code className="font-mono text-xs">{"{{first_name}}"}</code> the first name of
              whoever receives it
            </li>
            <li>
              <code className="font-mono text-xs">{"{{name}}"}</code> their whole name
            </li>
            <li>
              <code className="font-mono text-xs">{"{{project}}"}</code> the development
            </li>
            <li>
              <code className="font-mono text-xs">{"{{unit}}"}</code> the apartment code
            </li>
            <li>
              <code className="font-mono text-xs">{"{{details}}"}</code> bedrooms, areas, parking
            </li>
            <li>
              <code className="font-mono text-xs">{"{{price}}"}</code> the price before VAT
            </li>
            <li>
              <code className="font-mono text-xs">{"{{location}}"}</code> where it is
            </li>
            <li>
              <code className="font-mono text-xs">{"{{completion}}"}</code> when it is ready
            </li>
            <li>
              <code className="font-mono text-xs">{"{{month}}"}</code> this month
            </li>
            <li>
              <code className="font-mono text-xs">{"{{price_list_url}}"}</code> the live price list
            </li>
            <li>
              <code className="font-mono text-xs">{"{{files_url}}"}</code> the attachments, for
              WhatsApp
            </li>
          </ul>
        </Card>
      </div>

      <div className="space-y-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            title={template.name}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {template.isSystem ? <Pill>{t("campaigns.systemTemplate")}</Pill> : null}
                <Link
                  href={`/campaigns/new?template=${template.key}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary !px-3 !py-1 !text-xs"
                >
                  {t("campaigns.useTemplate")}
                </Link>
              </div>
            }
          >
            <p className="mb-3 text-xs text-brand-graphite/60">{template.description ?? ""}</p>
            <div className="mb-3 rounded border border-brand-line bg-brand-surface p-3">
              <p className="text-sm font-semibold">{template.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-brand-graphite">
                {template.body}
              </pre>
            </div>

            <Disclosure showLabel={t("campaigns.editTemplate")} hideLabel={t("common.cancel")}>
              <form action={saveTemplate.bind(null, template.id)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`name-${template.id}`}>
                      {t("common.name")}
                    </label>
                    <input
                      id={`name-${template.id}`}
                      name="name"
                      defaultValue={template.name}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`description-${template.id}`}>
                      {t("common.notes")}
                    </label>
                    <input
                      id={`description-${template.id}`}
                      name="description"
                      defaultValue={template.description ?? ""}
                      className="input"
                    />
                  </div>
                </div>

                <fieldset className="rounded border border-brand-line p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
                    EN
                  </legend>
                  <div className="space-y-2">
                    <input
                      name="subject"
                      defaultValue={template.subject ?? ""}
                      placeholder={t("campaigns.subject")}
                      className="input"
                    />
                    <textarea
                      name="body"
                      rows={8}
                      defaultValue={template.body}
                      className="textarea"
                    />
                    <textarea
                      name="bodyWhatsapp"
                      rows={3}
                      defaultValue={template.bodyWhatsapp ?? ""}
                      placeholder={t("campaigns.theWhatsapp")}
                      className="textarea"
                    />
                  </div>
                </fieldset>

                <fieldset className="rounded border border-brand-line p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
                    ΕΛ
                  </legend>
                  <div className="space-y-2">
                    <input
                      name="subjectEl"
                      defaultValue={template.subjectEl ?? ""}
                      placeholder={t("campaigns.subject")}
                      className="input"
                    />
                    <textarea
                      name="bodyEl"
                      rows={8}
                      defaultValue={template.bodyEl ?? ""}
                      className="textarea"
                    />
                    <textarea
                      name="bodyWhatsappEl"
                      rows={3}
                      defaultValue={template.bodyWhatsappEl ?? ""}
                      placeholder={t("campaigns.theWhatsapp")}
                      className="textarea"
                    />
                  </div>
                </fieldset>

                <fieldset className="rounded border border-brand-line p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
                    {t("campaigns.whoGetsIt")}
                  </legend>
                  <div className="flex flex-wrap gap-5">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="toClients" defaultChecked={template.toClients} />
                      <span>{t("campaigns.groupClients")}</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="toAgents" defaultChecked={template.toAgents} />
                      <span>{t("campaigns.groupAgents")}</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="toSubowners"
                        defaultChecked={template.toSubowners}
                      />
                      <span>{t("campaigns.groupSubowners")}</span>
                    </label>
                  </div>
                </fieldset>

                <button type="submit" className="btn btn-primary">
                  {t("common.save")}
                </button>
              </form>
            </Disclosure>
          </Card>
        ))}
      </div>
    </>
  );
}
