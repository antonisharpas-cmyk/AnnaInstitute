import type { MessageKey } from "@/i18n";
import type { WhoWhereLabels } from "@/components/AppointmentFields";

/** The words of the who and where boxes, in whichever language the page is in. */
export function whoWhereLabels(t: (key: MessageKey) => string): WhoWhereLabels {
  return {
    withKind: t("appointments.withKind"),
    withClient: t("appointments.withClient"),
    withLead: t("appointments.withLead"),
    withAgent: t("appointments.withAgent"),
    withOther: t("appointments.withOther"),
    who: t("appointments.who"),
    otherName: t("appointments.otherName"),
    otherEmail: t("appointments.otherEmail"),
    otherPhone: t("appointments.otherPhone"),
    otherNote: t("appointments.otherNote"),
    kind: t("appointments.kindWhere"),
    building: t("appointments.building"),
    chooseBuilding: t("appointments.chooseBuilding"),
    other: t("appointments.typeOther"),
    otherHint: t("appointments.typeOtherHint"),
    detail: t("appointments.detail"),
    detailHint: t("appointments.detailHint"),
    choose: t("common.choose"),
    search: t("common.searchByName"),
    noMatch: t("common.noMatch"),
  };
}

/** Everybody an appointment can be with, as the boxes want them. */
export function peopleOptions(people: {
  clients: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null }[];
  leads: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null }[];
  agents: { id: string; name: string; phone: string | null; email: string | null }[];
}) {
  const person = (first: string | null, last: string | null) => `${first ?? ""} ${last ?? ""}`.trim();
  return {
    clients: people.clients.map((one) => ({
      value: `client:${one.id}`,
      label: person(one.firstName, one.lastName),
      hint: one.phone ?? one.email ?? undefined,
    })),
    leads: people.leads.map((one) => ({
      value: `lead:${one.id}`,
      label: person(one.firstName, one.lastName) || one.email || one.phone || "",
      hint: one.phone ?? one.email ?? undefined,
    })),
    agents: people.agents.map((one) => ({
      value: `agent:${one.id}`,
      label: one.name,
      hint: one.phone ?? one.email ?? undefined,
    })),
  };
}
