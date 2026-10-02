import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { constructorPayments, constructorProjects, constructors, documents, projects } from "@/db/schema";
import { toCents } from "@/lib/money";

/**
 * Constructors: who builds each development, for how much, and what has been
 * paid them.
 *
 * A development has one constructor and one agreed amount. Each payment is
 * written down Pending, with the kind of payment in the office's own words;
 * once the constructor's invoice and receipt are in it is marked Paid, or it
 * is Cancelled. Only Paid counts against the agreed amount.
 */

export const CONSTRUCTOR_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;
export type ConstructorStatus = (typeof CONSTRUCTOR_STATUSES)[number];

export async function listConstructors(query = "") {
  const q = query.trim();
  const where: SQL | undefined = q
    ? (or(
        ilike(constructors.name, `%${q}%`),
        ilike(constructors.company, `%${q}%`),
        ilike(constructors.email, `%${q}%`),
        ilike(constructors.phone, `%${q}%`),
      ) as SQL)
    : undefined;
  return db
    .select({
      builder: constructors,
      projects: sql<string | null>`(select string_agg(p.name, ', ' order by p.name) from constructor_projects cp join projects p on p.id = cp.project_id where cp.constructor_id = "constructors"."id")`,
      agreed: sql<string>`coalesce((select sum(cp.agreed_amount) from constructor_projects cp where cp.constructor_id = "constructors"."id"), 0)`,
      paid: sql<string>`coalesce((select sum(x.amount) from constructor_payments x join constructor_projects cp on cp.id = x.constructor_project_id where cp.constructor_id = "constructors"."id" and x.status = 'PAID'), 0)`,
      pending: sql<string>`coalesce((select sum(x.amount) from constructor_payments x join constructor_projects cp on cp.id = x.constructor_project_id where cp.constructor_id = "constructors"."id" and x.status = 'PENDING'), 0)`,
    })
    .from(constructors)
    .where(where)
    .orderBy(asc(constructors.name));
}

export type PaymentWithPapers = typeof constructorPayments.$inferSelect & {
  invoices: { id: string; title: string }[];
  receipts: { id: string; title: string }[];
};

/** Where one development stands with its constructor, and every payment, newest first. */
export type ConstructorJob = {
  job: typeof constructorProjects.$inferSelect;
  project: { id: string; name: string };
  agreedCents: number;
  paidCents: number;
  pendingCents: number;
  remainingCents: number;
  payments: PaymentWithPapers[];
};

async function jobsWhere(where: SQL): Promise<ConstructorJob[]> {
  const jobs = await db
    .select({ job: constructorProjects, project: { id: projects.id, name: projects.name } })
    .from(constructorProjects)
    .innerJoin(projects, eq(projects.id, constructorProjects.projectId))
    .where(where)
    .orderBy(asc(projects.name));
  if (jobs.length === 0) return [];
  const pays = await db
    .select()
    .from(constructorPayments)
    .where(inArray(constructorPayments.constructorProjectId, jobs.map((one) => one.job.id)))
    .orderBy(desc(constructorPayments.paidOn), desc(constructorPayments.createdAt));
  const papers = pays.length
    ? await db
        .select({ id: documents.id, title: documents.title, category: documents.category, paymentId: documents.constructorPaymentId })
        .from(documents)
        .where(inArray(documents.constructorPaymentId, pays.map((one) => one.id)))
        .orderBy(asc(documents.createdAt))
    : [];
  return jobs.map(({ job, project }) => {
    const mine = pays
      .filter((one) => one.constructorProjectId === job.id)
      .map((one) => ({
        ...one,
        invoices: papers.filter((p) => p.paymentId === one.id && p.category === "INVOICE").map((p) => ({ id: p.id, title: p.title })),
        receipts: papers.filter((p) => p.paymentId === one.id && p.category === "RECEIPT").map((p) => ({ id: p.id, title: p.title })),
      }));
    const sum = (status: ConstructorStatus) =>
      mine.filter((one) => one.status === status).reduce((a, one) => a + toCents(one.amount), 0);
    const agreedCents = toCents(job.agreedAmount);
    const paidCents = sum("PAID");
    return {
      job,
      project,
      agreedCents,
      paidCents,
      pendingCents: sum("PENDING"),
      remainingCents: agreedCents - paidCents,
      payments: mine,
    };
  });
}

export async function constructorWithJobs(id: string) {
  const [found] = await db.select().from(constructors).where(eq(constructors.id, id)).limit(1);
  if (!found) return null;
  return { constructor: found, jobs: await jobsWhere(eq(constructorProjects.constructorId, id)) };
}

/** The constructor of a development, for its page and its report. */
export async function constructorOfProject(projectId: string) {
  const jobs = await jobsWhere(eq(constructorProjects.projectId, projectId));
  const job = jobs[0];
  if (!job) return null;
  const [who] = await db.select().from(constructors).where(eq(constructors.id, job.job.constructorId)).limit(1);
  return who ? { constructor: who, ...job } : null;
}

/** The developments that have no constructor yet, for the picker. */
export async function projectsWithoutConstructor() {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(sql`not exists (select 1 from constructor_projects cp where cp.project_id = "projects"."id")`)
    .orderBy(asc(projects.name));
}

export const constructorStatusTone = (status: string) =>
  status === "PAID" ? "good" : status === "CANCELLED" ? "bad" : "warn";

/** Whether a job belongs to a constructor, so an action cannot reach another one's. */
export async function jobOf(jobId: string) {
  const [row] = await db.select().from(constructorProjects).where(eq(constructorProjects.id, jobId)).limit(1);
  return row ?? null;
}

export async function paymentOf(paymentId: string) {
  const [row] = await db
    .select({ payment: constructorPayments, job: constructorProjects })
    .from(constructorPayments)
    .innerJoin(constructorProjects, eq(constructorProjects.id, constructorPayments.constructorProjectId))
    .where(and(eq(constructorPayments.id, paymentId)))
    .limit(1);
  return row ?? null;
}
