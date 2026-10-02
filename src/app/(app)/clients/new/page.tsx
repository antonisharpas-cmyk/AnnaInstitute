import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { optionsFor } from "@/lib/choices";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ClientForm from "../ClientForm";
import { createClient } from "../actions";
import { extrasLabels } from "@/lib/buyerLabels";
import { whoCanGo } from "@/lib/team";

export default async function NewClientPage() {
  const { t } = await getTranslator();

  return (
    <>
      <BackLink
        href="/clients"
        label={`${t("common.backTo")} ${t("clients.title").toLowerCase()}`}
      />
      <PageHeader title={t("clients.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("clients.title")}>
          <ClientForm
            action={createClient}
            cancelHref="/clients"
            t={t}
            idTypes={await optionsFor("idType", t)}
            extras={extrasLabels(t)}
            team={await whoCanGo()}
            sources={await optionsFor("clientSource", t)}
            agents={(await db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name))).map((one) => ({
              value: one.id,
              label: one.name,
              hint: one.email ?? one.phone ?? undefined,
            }))}
          />
          <p className="mt-3 text-xs text-brand-graphite/60">
            The apartment is assigned on the client page once the record is saved.
          </p>
        </Card>
      </div>
    </>
  );
}
