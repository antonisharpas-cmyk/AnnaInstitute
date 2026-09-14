import type { MessageKey } from "@/i18n";

/** The period picker asks for the same words on every report. */
export function periodLabels(t: (key: MessageKey) => string) {
  return {
    period: t("reports.period"),
    last12: t("reports.last12"),
    last24: t("reports.last24"),
    thisYear: t("reports.thisYear"),
    everything: t("reports.everything"),
    fromDate: t("reports.fromDate"),
    toDate: t("reports.toDate"),
    apply: t("reports.apply"),
    download: t("reports.download"),
  };
}

/** A period as it travels in a link, so a download covers what is on screen. */
export function periodQuery(params: { period?: string; from?: string; to?: string }) {
  const search = new URLSearchParams();
  if (params.period) search.set("period", params.period);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  return search.toString();
}
