import { notFound } from "next/navigation";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { optionsFor } from "@/lib/choices";
import { partnerById } from "@/lib/partners";
import { BackLink, Card, PageHeader } from "@/components/ui";
import DeleteRecord from "@/components/DeleteRecord";
import PartnerForm from "../PartnerForm";
import Offers from "./Offers";
import PartyInvoices from "@/components/PartyInvoices";
import Pagination, { pageOf, pageWords } from "@/components/Pagination";
import { offersOf } from "@/lib/partnerOffers";
import { deletePartner, updatePartner } from "../actions";

/** One partner, to change or take off the directory. */
export const dynamic = "force-dynamic";

export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offersPage?: string }>;
}) {
  const pages = await searchParams;
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const partner = await partnerById(id);
  if (!partner) notFound();
  const { t, locale } = await getTranslator();
  /* Their offers ten at a time, with the page numbers under them. */
  const offersShown = pageOf(await offersOf(partner.id), pages, 10, "offersPage");
  const categories = await optionsFor("partnerCategory", t, { current: partner.category });

  return (
    <>
      <BackLink href="/partners" label={`${t("common.backTo")} ${t("partners.title").toLowerCase()}`} />
      <PageHeader title={partner.name} />
      <div className="max-w-3xl space-y-4">
        <Card title={t("partners.details")}>
          <PartnerForm action={updatePartner.bind(null, partner.id)} partner={partner} categories={categories} t={t} />
        </Card>
        <Offers
          partnerId={partner.id}
          offers={offersShown.rows}
          locale={locale}
          labels={{
            title: t("offers.title"),
            add: t("offers.add"),
            cancel: t("common.cancel"),
            item: t("offers.item"),
            itemHint: t("offers.itemHint"),
            price: t("offers.price"),
            priceHint: t("offers.priceHint"),
            notes: t("common.notes"),
            notesHint: t("offers.notesHint"),
            files: t("offers.files"),
            filesHint: t("offers.filesHint"),
            moreFiles: t("offers.moreFiles"),
            save: t("common.save"),
            edit: t("common.edit"),
            remove: t("common.delete"),
            sure: t("remove.sure"),
            none: t("offers.none"),
            added: t("offers.added"),
            by: t("leads.noteBy"),
            noPrice: t("offers.noPrice"),
          }}
        />
        <Pagination basePath={`/partners/${partner.id}`} params={pages} pageKey="offersPage" info={offersShown.info} labels={pageWords(t)} />
        <PartyInvoices kind="PARTNER" id={partner.id} t={t} locale={locale} />
        <DeleteRecord
          action={deletePartner.bind(null, partner.id)}
          label={t("partners.delete")}
          what={t("partners.deleteWhat")}
          confirm={t("partners.deleteConfirm")}
        />
      </div>
    </>
  );
}
