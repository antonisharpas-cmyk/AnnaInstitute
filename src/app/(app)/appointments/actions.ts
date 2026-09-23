"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, teamMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { letterForAppointment } from "@/lib/automaticEmails";
import { flash } from "@/lib/flash";

/*
 * Arranging a meeting, and saying afterwards whether it happened.
 *
 * Four things only: make one, move one, say it was done, say it was not. The
 * office does not need a workflow, they need the list on the screen to match
 * what actually happened, which is a job of two buttons.
 */

/** Where everything that shows appointments has to be redrawn. */
async function redraw(clientId: string | null, leadId: string | null) {
  revalidatePath("/appointments");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/**
 * The day and the time, read off a form as two fields and kept as one moment.
 *
 * Two boxes because that is how anybody says it out loud, the 21st at four. One
 * column because a date in one place and a time in another is how a CRM ends up
 * showing a viewing at midnight.
 */
function moment(day: string, time: string): Date | null {
  if (!day) return null;
  const at = new Date(`${day}T${(time || "09:00").slice(0, 5)}:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** One of the office's six kinds, or the catch all. */
const KINDS = ["TIMBER", "BATHROOMS_TILES", "OFFICE", "PHONE_CALL", "BUILDING", "OTHER"] as const;
type Kind = (typeof KINDS)[number];

function kindOf(raw: string): Kind {
  return (KINDS as readonly string[]).includes(raw) ? (raw as Kind) : "OTHER";
}

/** Who it is with, from one field that carries both kinds of person. */
function whoWith(raw: string): { clientId: string | null; leadId: string | null } {
  if (raw.startsWith("client:")) return { clientId: raw.slice(7), leadId: null };
  if (raw.startsWith("lead:")) return { clientId: null, leadId: raw.slice(5) };
  return { clientId: null, leadId: null };
}

export async function createAppointment(formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const place = String(formData.get("place") ?? "").trim();
  const at = moment(String(formData.get("day") ?? ""), String(formData.get("time") ?? ""));
  const { clientId, leadId } = whoWith(String(formData.get("with") ?? ""));

  /* Three things are needed and the form says which is missing rather than
     saving half an appointment nobody can act on. */
  if (!place) {
    await flash("said.appointmentNeedsPlace", "bad");
    return;
  }
  if (!at) {
    await flash("said.appointmentNeedsDay", "bad");
    return;
  }
  /* A client, specifically. An enquiry is followed up rather than met, which
     is the office's own split: appointments for clients, follow ups for leads. */
  if (!clientId) {
    await flash("said.appointmentNeedsPerson", "bad");
    return;
  }

  const [made] = await db
    .insert(appointments)
    .values({
      place,
      at,
      clientId,
      leadId,
      type: kindOf(String(formData.get("type") ?? "OTHER")),
      /* What Other was, kept only when Other is what was chosen. */
      typeOther:
        kindOf(String(formData.get("type") ?? "OTHER")) === "OTHER"
          ? String(formData.get("typeOther") ?? "").trim() || null
          : null,
      assignedToId: String(formData.get("assignedToId") ?? "") || null,
      createdById: user.id,
    })
    .returning({ id: appointments.id });

  await recordAudit({
    action: "appointment.create",
    entity: "appointment",
    entityId: made.id,
    detail: `${place}, ${at.toISOString().slice(0, 16).replace("T", " ")}`,
    userId: user.id,
    userEmail: user.email,
  });

  /*
   * The person being met is told, at once.
   *
   * After the appointment is safely written down, never before, and never in a
   * way that can lose it: whatever becomes of the letter is recorded in the
   * automatic emails section and the appointment stands either way.
   */
  await letterForAppointment(made.id, "made");

  await flash("said.appointmentMade");
  await redraw(clientId, leadId);
}

/** Moved to another day or another place, which happens more than it is kept. */
export async function updateAppointment(appointmentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) return;

  const place = String(formData.get("place") ?? "").trim() || row.place;
  const at =
    moment(String(formData.get("day") ?? ""), String(formData.get("time") ?? "")) ?? row.at;
  const type = formData.has("type") ? kindOf(String(formData.get("type"))) : row.type;
  const typeOther =
    type === "OTHER"
      ? formData.has("typeOther")
        ? String(formData.get("typeOther") ?? "").trim() || null
        : row.typeOther
      : null;
  const assignedToId = formData.has("assignedToId")
    ? String(formData.get("assignedToId") ?? "") || null
    : row.assignedToId;

  await db
    .update(appointments)
    .set({ place, at, type, typeOther, assignedToId, updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));

  /*
   * Moved, so the person being met is told it moved.
   *
   * Only when something they would notice has changed. Correcting a spelling in
   * the place does not deserve a second letter, but a different day, time,
   * place, kind or person does, because those are the things somebody writes in
   * their own diary.
   */
  const moved =
    place !== row.place ||
    at.getTime() !== new Date(row.at).getTime() ||
    type !== row.type ||
    assignedToId !== row.assignedToId;
  if (moved) await letterForAppointment(appointmentId, "moved");

  await recordAudit({
    action: "appointment.update",
    entity: "appointment",
    entityId: appointmentId,
    detail: `${place}, ${at.toISOString().slice(0, 16).replace("T", " ")}`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  await redraw(row.clientId, row.leadId);
}

/**
 * It happened, or it did not.
 *
 * The same action for both answers, because they are the same decision and
 * splitting them into two would mean two places to keep in step. Answering also
 * stamps who said so and when, so an appointment that was marked done in error
 * can be traced rather than argued about.
 */
export async function answerAppointment(
  appointmentId: string,
  answer: "DONE" | "MISSED" | "PLANNED",
) {
  const user = await requireUser(["ADMIN"]);

  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) return;

  await db
    .update(appointments)
    .set({
      status: answer,
      /* Put back to planned, it is waiting on an answer again, so the stamp goes. */
      answeredAt: answer === "PLANNED" ? null : new Date(),
      answeredById: answer === "PLANNED" ? null : user.id,
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, appointmentId));

  await recordAudit({
    action: "appointment.answer",
    entity: "appointment",
    entityId: appointmentId,
    detail: `${row.place}: ${answer}`,
    userId: user.id,
    userEmail: user.email,
  });

  /* Cancelled, so nobody is left waiting outside a showroom. Only on the way
     into cancelled, so pressing it twice does not write twice. */
  if (answer === "MISSED" && row.status !== "MISSED") {
    await letterForAppointment(appointmentId, "cancelled");
  }

  await flash(
    answer === "DONE"
      ? "said.appointmentDone"
      : answer === "MISSED"
        ? "said.appointmentMissed"
        : "said.saved",
  );
  await redraw(row.clientId, row.leadId);
}

export async function deleteAppointment(appointmentId: string) {
  const user = await requireUser(["ADMIN"]);

  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) return;

  await db.delete(appointments).where(eq(appointments.id, appointmentId));

  await recordAudit({
    action: "appointment.delete",
    entity: "appointment",
    entityId: appointmentId,
    detail: row.place,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  await redraw(row.clientId, row.leadId);
}

/* --------------------------------------------------------------------------
   The people in the office.

   A name and an email address. No login, no role, no password: the man going
   to the tile shop on Thursday should be in the CRM in ten seconds.
   -------------------------------------------------------------------------- */

export async function addTeamMember(formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    await flash("said.teamNeedsName", "bad");
    return;
  }

  const [made] = await db
    .insert(teamMembers)
    .values({
      name,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
    })
    .returning({ id: teamMembers.id });

  await recordAudit({
    action: "team.add",
    entity: "team",
    entityId: made.id,
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.teamAdded");
  revalidatePath("/team");
  revalidatePath("/appointments");
}

export async function updateTeamMember(memberId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, memberId)).limit(1);
  if (!row) return;

  const name = String(formData.get("name") ?? "").trim() || row.name;

  await db
    .update(teamMembers)
    .set({
      name,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      /* A checkbox that is not ticked sends nothing at all. */
      isActive: formData.get("isActive") === "on",
      updatedAt: new Date(),
    })
    .where(eq(teamMembers.id, memberId));

  await recordAudit({
    action: "team.update",
    entity: "team",
    entityId: memberId,
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  revalidatePath("/team");
  revalidatePath("/appointments");
}

/**
 * Taking somebody off the list.
 *
 * Their appointments are not deleted with them: the appointments happened, and
 * losing the history of who went where to save a row is not a trade worth
 * making. The appointments simply stop naming anybody, which the list shows
 * plainly so the office can hand them to somebody else.
 */
export async function deleteTeamMember(memberId: string) {
  const user = await requireUser(["ADMIN"]);

  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, memberId)).limit(1);
  if (!row) return;

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));

  await recordAudit({
    action: "team.delete",
    entity: "team",
    entityId: memberId,
    detail: row.name,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  revalidatePath("/team");
  revalidatePath("/appointments");
}
