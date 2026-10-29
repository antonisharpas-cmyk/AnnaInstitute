import { notFound } from "next/navigation";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { optionsFor } from "@/lib/choices";
import { partnerById } from "@/lib/partners";
import { BackLink, Card, PageHeader } from "@/components/ui";
import DeleteRecord from "@/components/DeleteRecord";
import PartnerForm from "../PartnerForm";
import Offers from "./Offers";
import { offersOf } from "@/lib/partnerOffers";
import { deletePartner, updatePartner } from "../actions";

/** One partner, to change or take off the directory. */
export const dynamic = "force-dynamic";

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const partner = await partnerById(id);
  if (!partner) notFound();
  const { t, locale } = await getTranslator();
  const offers = await offersOf(partner.id);
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
          offers={offers}
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
