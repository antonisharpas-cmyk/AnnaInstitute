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

    const message = error instanceof Error ? error.message : String(error);
    if (/relation .* does not exist/i.test(message)) {
      return {
        error: "setup",
        detail:
          "The database is reachable but the tables are not there yet. Run npm run db:migrate and then npm run db:seed.",
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
      detail: `${message}. Run npm run db:check for a plainer explanation.`,
    };
  }

  if (!user) {
    await recordAudit({ action: "login.failed", entity: "user", detail: email, userEmail: email });
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
