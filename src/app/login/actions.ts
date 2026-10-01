"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { DatabaseUrlError } from "@/db/url";

export type SignInState = { error: "credentials" } | { error: "setup"; detail: string } | null;

export async function signIn(_prev: unknown, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  let user: Awaited<ReturnType<typeof authenticate>>;

  try {
    user = await authenticate(email, password);
  } catch (error) {
    // A missing or unreachable database is a setup problem, not a wrong password,
    // and saying so saves half an hour of looking in the wrong place.
    if (error instanceof DatabaseUrlError) {
      return { error: "setup", detail: error.message };
    }

    /* The query builder wraps the database's own words in a "Failed query"
       message, with the real reason underneath, so both are read. */
    const reason =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const message = [error instanceof Error ? error.message : String(error), reason]
      .filter(Boolean)
      .join(" ");
    if (/relation .* does not exist/i.test(message)) {
      return {
        error: "setup",
        detail:
          "The database is reachable but the tables are not there yet. On Render, open the Shell of the web service and run npm run db:migrate:ci and then npm run db:seed:ci. On this computer, run npm run db:migrate and then npm run db:seed.",
      };
    }
    if (/does not support SSL|SSL off|no pg_hba\.conf entry|self.signed certificate/i.test(message)) {
      return {
        error: "setup",
        detail: `The database refused the secure connection (${reason || message}). On Render, use the Internal Database URL; if it still refuses, add DATABASE_SSL=false to the environment and deploy again.`,
      };
    }
    if (/password authentication failed/i.test(message)) {
      return {
        error: "setup",
        detail:
          "The database refused the user name or password inside DATABASE_URL. Copy the Internal Database URL again from the Render database page and paste it whole.",
      };
    }
    if (/ECONNREFUSED|ENOTFOUND|CONNECT_TIMEOUT|ETIMEDOUT|getaddrinfo/i.test(message)) {
      return {
        error: "setup",
        detail:
          "The database cannot be reached with the DATABASE_URL in .env.local. Run npm run db:check and it will say exactly why.",
      };
    }
    return {
      error: "setup",
      detail: `${reason || message}. Run npm run db:check for a plainer explanation (npm run db:check:ci on Render).`,
    };
  }

  if (!user) {
    await recordAudit({
      action: "login.failed",
      entity: "user",
      detail: email,
      userEmail: email,
    });
    return { error: "credentials" };
  }

  await createSession(user);
  await recordAudit({
    action: "login.success",
    entity: "user",
    entityId: user.id,
    userId: user.id,
    userEmail: user.email,
  });
  redirect("/");
}
