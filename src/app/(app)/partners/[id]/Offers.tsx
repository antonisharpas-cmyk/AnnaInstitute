import { Card, Empty } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import Disclosure from "@/components/Disclosure";
import { formatAmount, toCents } from "@/lib/money";
import type { Offer, OfferFile } from "@/lib/partnerOffers";
import { addPartnerOffer, deletePartnerOffer, deletePartnerOfferFile, updatePartnerOffer } from "../actions";

/*
 * What this partner offered: each item with its price and its pictures or
 * PDFs, newest first. Added, changed and taken off here, one by one.
 */
type Labels = {
  title: string;
  add: string;
  cancel: string;
  item: string;
  itemHint: string;
  price: string;
  priceHint: string;
  notes: string;
  notesHint: string;
  files: string;
  filesHint: string;
  moreFiles: string;
  save: string;
  edit: string;
  remove: string;
  sure: string;
  none: string;
  added: string;
  by: string;
  noPrice: string;
};

const isImage = (file: OfferFile) => (file.mimeType ?? "").startsWith("image/");

function OfferFields({ labels, offer, idPrefix }: { labels: Labels; offer?: Offer; idPrefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`${idPrefix}-name`}>
          {labels.item}
        </label>
        <input id={`${idPrefix}-name`} name="offerName" required defaultValue={offer?.name ?? ""} placeholder={labels.itemHint} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-price`}>
          {labels.price}
        </label>
        <input
          id={`${idPrefix}-price`}
          name="price"
          inputMode="decimal"
          defaultValue={offer?.price ? String(Number(offer.price)) : ""}
          placeholder={labels.priceHint}
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${idPrefix}-notes`}>
          {labels.notes}
        </label>
        <textarea id={`${idPrefix}-notes`} name="offerNotes" rows={2} defaultValue={offer?.notes ?? ""} placeholder={labels.notesHint} className="textarea" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${idPrefix}-files`}>
          {offer ? labels.moreFiles : labels.files}
        </label>
        <input id={`${idPrefix}-files`} name="files" type="file" multiple accept="image/*,application/pdf" className="input !py-1.5 text-xs" />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.filesHint}</p>
      </div>
    </div>
  );
}

export default function Offers({ partnerId, offers, labels, locale }: { partnerId: string; offers: Offer[]; labels: Labels; locale: string }) {
  const when = (value: Date) => new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");
  return (
    <Card title={labels.title}>
      <div className="mb-4">
        <Disclosure key={offers.length} showLabel={labels.add} hideLabel={labels.cancel}>
          <form action={addPartnerOffer.bind(null, partnerId)} className="space-y-3" data-add-offer>
            <OfferFields labels={labels} idPrefix="new-offer" />
            <SubmitButton>{labels.save}</SubmitButton>
          </form>
        </Disclosure>
      </div>

      {offers.length === 0 ? (
        <Empty message={labels.none} />
      ) : (
        <ul className="divide-y divide-brand-line" data-offers>
          {offers.map((offer) => (
            <li key={offer.id} className="py-3" data-offer={offer.name}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{offer.name}</p>
                  <p className="text-xs text-brand-graphite/60">
                    {labels.added} {when(offer.createdAt)}
                    {offer.addedBy ? ` ${labels.by} ${offer.addedBy}` : ""}
                  </p>
                </div>
                <p className="text-base font-semibold" data-offer-price>
                  {offer.price ? formatAmount(toCents(offer.price), locale) : <span className="text-sm font-normal text-brand-graphite/50">{labels.noPrice}</span>}
                </p>
              </div>
              {offer.notes ? <p className="mt-1 whitespace-pre-line text-sm text-brand-graphite/80">{offer.notes}</p> : null}

              {offer.files.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2" data-offer-files>
                  {offer.files.map((file) =>
                    isImage(file) ? (
                      <a key={file.id} href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" title={file.title} className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/${file.id}`} alt={file.title} loading="lazy" className="h-20 w-20 rounded border border-brand-line object-cover" />
                      </a>
                    ) : (
                      <a
                        key={file.id}
                        href={`/api/files/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-20 w-28 flex-col items-center justify-center rounded border border-brand-line bg-brand-surface px-2 text-center text-xs text-brand-teal-dark hover:underline"
                      >
                        <span className="font-semibold">PDF</span>
                        <span className="line-clamp-2 break-all">{file.originalName ?? file.title}</span>
                      </a>
                    ),
                  )}
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-start gap-2">
                <details className="w-full max-w-2xl" data-edit-offer>
                  <summary className="btn btn-secondary !px-3 !py-1 !text-xs inline-block cursor-pointer list-none">{labels.edit}</summary>
                  <div className="mt-2 space-y-3 rounded border border-brand-line bg-brand-surface p-3">
                    <form action={updatePartnerOffer.bind(null, offer.id)} className="space-y-3">
                      <OfferFields labels={labels} offer={offer} idPrefix={`offer-${offer.id}`} />
                      <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">{labels.save}</SubmitButton>
                    </form>
                    {offer.files.length > 0 ? (
                      <ul className="space-y-1 border-t border-brand-line pt-2 text-xs">
                        {offer.files.map((file) => (
                          <li key={file.id} className="flex items-center justify-between gap-2">
                            <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="truncate text-brand-teal-dark hover:underline">
                              {file.originalName ?? file.title}
                            </a>
                            <ConfirmButton action={deletePartnerOfferFile.bind(null, file.id, offer.id)} label={labels.remove} confirm={labels.sure} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="border-t border-brand-line pt-2">
                      <ConfirmButton action={deletePartnerOffer.bind(null, offer.id)} label={labels.remove} confirm={labels.sure} />
                    </div>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
