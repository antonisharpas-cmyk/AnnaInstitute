/**
 * Who a campaign goes to, read the same way everywhere.
 *
 * A campaign made since the four groups were ticked separately says so in its
 * flags. An older one only has the single audience it was made with.
 */
export function groupsOf(c: {
  toClients: boolean;
  toAgents: boolean;
  toSubowners: boolean;
  toLeads?: boolean | null;
  toBuyers?: boolean | null;
  toPartners?: boolean | null;
  audience: string;
}) {
  const flagged = c.toClients || c.toAgents || c.toSubowners || Boolean(c.toLeads) || Boolean(c.toBuyers) || Boolean(c.toPartners);
  if (flagged) {
    return {
      clients: c.toClients,
      agents: c.toAgents,
      subowners: c.toSubowners,
      leads: Boolean(c.toLeads),
      buyers: Boolean(c.toBuyers),
      partners: Boolean(c.toPartners),
    };
  }
  return {
    clients: c.audience === "CLIENTS_CONSENTED",
    agents: c.audience === "AGENTS",
    subowners: c.audience === "SUBOWNERS",
    leads: false,
    buyers: false,
    partners: false,
  };
}
