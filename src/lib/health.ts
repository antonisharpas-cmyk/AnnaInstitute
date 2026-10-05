import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Is the database up to date with the code?
 *
 * A migration that has not been run shows itself as a raw SQL error on
 * whichever page happens to ask first, which tells the person nothing they can
 * act on. So the parts the code needs are checked once, at the door, and if
 * anything is missing the CRM says exactly that and exactly what to run.
 *
 * The answer is remembered for the life of the process, because a database
 * that is up to date does not become out of date while the app is running, and
 * this must not add a query to every page load.
 */

type Missing = { what: string; migration: string };

/** What each release added, newest last. */
const NEEDS: { probe: string; what: string; migration: string }[] = [
  {
    probe: "select user_id from dashboard_layouts limit 1",
    what: "the dashboard_layouts table",
    migration: "0012",
  },
  {
    probe: "select id from saved_views limit 1",
    what: "the saved_views table",
    migration: "0013",
  },
  {
    probe: "select user_id from list_settings limit 1",
    what: "the list_settings table",
    migration: "0013",
  },
  {
    probe: "select deleted_at from leads limit 1",
    what: "the deleted_at column on leads",
    migration: "0013",
  },
  {
    probe: "select deleted_at from clients limit 1",
    what: "the deleted_at column on clients",
    migration: "0013",
  },
  {
    probe: "select status_by_hand_at from units limit 1",
    what: "the status_by_hand_at column on units",
    migration: "0014",
  },
  {
    probe: "select status_by_hand_at from projects limit 1",
    what: "the status_by_hand_at column on projects",
    migration: "0014",
  },
  {
    probe: "select body from lead_notes limit 1",
    what: "the lead_notes table",
    migration: "0015",
  },
  {
    probe: "select agent_id from leads limit 1",
    what: "the agent_id column on leads",
    migration: "0016",
  },
  {
    probe: "select vat_rate from units limit 1",
    what: "the vat_rate column on units",
    migration: "0018",
  },
  {
    probe: "select kind, cash_amount from contracts limit 1",
    what: "the kind and cash_amount columns on contracts",
    migration: "0018",
  },
  {
    probe: "select holder from subowner_shares limit 1",
    what: "the subowner_shares table",
    migration: "0018",
  },
  {
    probe: "select name from subowner_directors limit 1",
    what: "the subowner_directors table",
    migration: "0018",
  },
  {
    probe: "select commission_id from documents limit 1",
    what: "the commission_id column on documents",
    migration: "0019",
  },
  {
    probe: "select completed_at from commissions limit 1",
    what: "the completed_at column on commissions",
    migration: "0019",
  },
  {
    probe: "select share_percent, plot_reference from contracts limit 1",
    what: "the land exchange columns on contracts",
    migration: "0020",
  },
  {
    probe: "select unit_id from contract_units limit 1",
    what: "the contract_units table",
    migration: "0020",
  },
  {
    probe: "select 'LAND_OWNER'::contact_source",
    what: "the land owner client source",
    migration: "0021",
  },
  {
    probe: "select contract_value from contracts limit 1",
    what: "the value written on the contract",
    migration: "0022",
  },
  {
    probe: "select place, at from appointments limit 1",
    what: "the appointments table",
    migration: "0023",
  },
  {
    probe: "select name from team_members limit 1",
    what: "the team members table",
    migration: "0024",
  },
  {
    probe: "select type, assigned_to_id from appointments limit 1",
    what: "the appointment type and who it is assigned to",
    migration: "0024",
  },
  {
    probe: "select 'WHATSAPP'::contact_source",
    what: "the WhatsApp and website client sources",
    migration: "0025",
  },
  {
    probe: "select assigned_to_id from leads limit 1",
    what: "who a lead is assigned to",
    migration: "0026",
  },
  {
    probe: "select note, at from lead_follow_ups limit 1",
    what: "the follow ups table",
    migration: "0026",
  },
  {
    probe: "select is_automatic, is_active from email_templates limit 1",
    what: "the automatic email switches",
    migration: "0028",
  },
  {
    probe: "select template_key from automatic_emails limit 1",
    what: "the automatic emails record",
    migration: "0028",
  },
  {
    probe: "select type_other from appointments limit 1",
    what: "what an Other appointment is",
    migration: "0029",
  },
  {
    probe: "select closed_at, closed_reason from clients limit 1",
    what: "closing a client",
    migration: "0030",
  },
  {
    probe: "select appointment_id, agent_id from automatic_emails limit 1",
    what: "the appointment and agent letters",
    migration: "0030",
  },
  {
    probe: "select vat_number from clients limit 1",
    what: "the VAT number on a client",
    migration: "0033",
  },
  {
    probe: "select number, snapshot from issued_documents limit 1",
    what: "the issued invoices and receipts",
    migration: "0033",
  },
  {
    probe: "select reference from payments limit 1",
    what: "the cheque or bank reference on a payment",
    migration: "0033",
  },
  {
    probe: "select reduced_vat_net, reduced_vat_approved_on from contracts limit 1",
    what: "the reduced VAT approval on contracts",
    migration: "0034",
  },
  {
    probe: "select kind, invoiced_by_id from payments limit 1",
    what: "credits carried between stages",
    migration: "0034",
  },
  {
    probe: "select purpose, credited_by_id from issued_documents limit 1",
    what: "credit notes",
    migration: "0034",
  },
  {
    probe: "select purpose, amount from refunds limit 1",
    what: "refunds and delay penalties",
    migration: "0034",
  },
  {
    probe: "select direction, subowner_id, vat_rate, category_other from expenses limit 1",
    what: "invoices to partners",
    migration: "0035",
  },
  {
    probe: "select expense_id from issued_documents limit 1",
    what: "the invoice series shared with partner invoices",
    migration: "0035",
  },
  {
    probe: "select list, code, label_en, active, sort_order from choices limit 1",
    what: "the office's own lists in the Builder",
    migration: "0036",
  },
  {
    probe: "select l.status_choice, l.source_choice, c.source_choice, c.id_type_choice from leads l, clients c limit 1",
    what: "the Builder's own values on leads and clients",
    migration: "0036",
  },
  {
    probe: "select p.status_choice, u.status_choice, k.status_choice, a.type_choice, e.category_choice from projects p, units u, contracts k, appointments a, expenses e limit 1",
    what: "the Builder's own values on projects, apartments, contracts, appointments and invoices",
    migration: "0036",
  },
  {
    probe: "select kind_choice from contracts limit 1",
    what: "the office's own kinds of contract",
    migration: "0037",
  },
  {
    probe: "select project_id, unit_id from campaigns limit 1",
    what: "what a campaign is about, for its placeholders",
    migration: "0038",
  },
  {
    probe: "select project_id, unit_id from share_links limit 1",
    what: "price lists for one development or one apartment",
    migration: "0039",
  },
  {
    probe: "select to_leads, project_ids from campaigns limit 1",
    what: "campaigns to leads, companies with shareholders, cash received and appointments with anybody",
    migration: "0040",
  },
  {
    probe: "select id from cash_receipts limit 1",
    what: "cash received against a contract",
    migration: "0040",
  },
  {
    probe: "select logo_path, iban, next_invoice from subowners limit 1",
    what: "each company's own invoices, receipts and credit notes",
    migration: "0041",
  },
  {
    probe: "select issuer_id from issued_documents limit 1",
    what: "a running number series for each company",
    migration: "0041",
  },
  {
    probe: "select client_id, agent_id, other_name, assigned_to_id from lead_follow_ups limit 1",
    what: "follow ups with clients, agents and anybody else",
    migration: "0041",
  },
  {
    probe: "select 'CANCELLED'::follow_up_status",
    what: "a follow up that was cancelled",
    migration: "0042",
  },
  {
    probe: "select birth_date, second_first_name, loan_email from clients limit 1",
    what: "birthdays, a second buyer and a bank loan",
    migration: "0043",
  },
  {
    probe: "select parts_total, cc_emails from payments limit 1",
    what: "a stage paid in parts, and email copies",
    migration: "0043",
  },
  {
    probe: "select project_id, net_amount from expense_lines limit 1",
    what: "an invoice for several developments",
    migration: "0044",
  },
  {
    probe: "select agreed_amount from constructor_projects limit 1",
    what: "constructors and their payments",
    migration: "0045",
  },
  {
    probe: "select lead_id from automatic_emails limit 1",
    what: "letters to agents about their potential clients",
    migration: "0045",
  },
  {
    probe: "select kind, signed_document_id from signing_papers limit 1",
    what: "the Reservation and Contract of Sale, from draft to signed",
    migration: "0046",
  },
  {
    probe: "select campaign_channel from agents limit 1",
    what: "how each agent wants campaigns",
    migration: "0046",
  },
  {
    probe: "select installment_id from issued_documents limit 1",
    what: "invoices issued for a stage before the money comes in",
    migration: "0046",
  },
  {
    probe: "select assigned_to_id from clients limit 1",
    what: "the team member who looks after a client",
    migration: "0047",
  },
  {
    probe: "select about_ids from campaigns limit 1",
    what: "campaigns about several developments or apartments",
    migration: "0047",
  },
  {
    probe: "select birth_date from team_members limit 1",
    what: "birthdays for the team, agents, shareholders and directors",
    migration: "0048",
  },
  {
    probe: "select reduced_vat_document_id from contracts limit 1",
    what: "the paper that approves the reduced VAT",
    migration: "0048",
  },
  {
    probe: "select invoice_sent_at from installments limit 1",
    what: "the invoice of each stage, sent with its papers",
    migration: "0049",
  },
  {
    probe: "select installment_id from documents limit 1",
    what: "the architect's certificate and photographs of a stage",
    migration: "0049",
  },
  {
    probe: "select party_kind, our_company_id from expenses limit 1",
    what: "company invoices both ways, with who is on each side",
    migration: "0050",
  },
  {
    probe: "select receipt_document_id from expense_payments limit 1",
    what: "the payments on company invoices, with their receipts",
    migration: "0050",
  },
];

let answer: Missing[] | null = null;
let attempt: Promise<"done" | "skipped" | "failed"> | null = null;

export async function schemaGaps(): Promise<Missing[]> {
  if (answer !== null) return answer;

  const gaps: Missing[] = [];

  for (const need of NEEDS) {
    try {
      await db.execute(sql.raw(need.probe));
    } catch {
      gaps.push({ what: need.what, migration: need.migration });
    }
  }

  answer = gaps;
  return gaps;
}

/** Forget the answer, for the moment after somebody has run the migration. */
export function forgetSchemaGaps(): void {
  answer = null;
}

/**
 * Make it right if it is wrong.
 *
 * The migration is run here rather than when the server boots, because this
 * runs inside the process that is already holding the database. A local
 * database allows exactly one writer, so doing it anywhere else is a coin
 * toss: this way the connection doing the migrating is the same connection
 * that will read the result.
 *
 * It is attempted once per process, however many pages ask at the same moment,
 * and if it cannot be done the gaps are returned so the screen can say so.
 */
export async function ensureSchema(): Promise<Missing[]> {
  const gaps = await schemaGaps();
  if (gaps.length === 0) return gaps;

  if (!attempt) {
    attempt = (async () => {
      const { bringSchemaUpToDate } = await import("@/db/bootstrap");
      return bringSchemaUpToDate();
    })();
  }

  const outcome = await attempt;

  if (outcome !== "done") {
    if (outcome === "skipped") {
      console.warn("  The database is behind the code. Stop the app and run npm run db:migrate.");
    }
    return gaps;
  }

  forgetSchemaGaps();
  const left = await schemaGaps();

  if (left.length === 0) {
    console.log("  The database was brought up to date.");
  } else {
    attempt = null;
  }

  return left;
}
