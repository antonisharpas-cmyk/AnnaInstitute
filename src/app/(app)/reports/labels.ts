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
    building: t("projects.title"),
    partner: t("clients.partner"),
    everyBuilding: t("reports.everyBuilding"),
    everyPartner: t("reports.everyPartner"),
    oursAlone: t("reports.oursAlone"),
  };
}

/** A period as it travels in a link, so a download covers what is on screen. */
export function periodQuery(params: {
  period?: string;
  from?: string;
  to?: string;
  project?: string;
  partner?: string;
}) {
  const search = new URLSearchParams();
  if (params.period) search.set("period", params.period);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  /* The deal travels with the period, so a download is what is on the screen
     rather than the whole book under the name of one building. */
  if (params.project) search.set("project", params.project);
  if (params.partner) search.set("partner", params.partner);
  return search.toString();
}
