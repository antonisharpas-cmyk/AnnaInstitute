/**
 * The evening run.
 *
 * Next.js calls register() once when the server starts, which is the one place
 * in this application where something can be made to happen without anybody
 * pressing anything. So the day's appointment summary is set going from here:
 * every ten minutes the app is asked whether the hour the office set has come,
 * and if it has and today's summary has not gone, it goes.
 *
 * Why it asks over HTTP rather than reading the database itself. This file is
 * bundled on its own, so anything it imports gets its own copy of the database
 * client, and a local PGlite database opened twice in one process is a database
 * that falls over. Knocking on the app's own door costs a millisecond and keeps
 * one connection, which is the whole point.
 *
 * The door is only open to this process: register() puts a fresh random token
 * in the environment, which the route checks. The same route also takes an API
 * key, for an office that would rather drive the whole thing from Windows Task
 * Scheduler or a cron line.
 *
 * Nothing is imported here on purpose. This file is compiled for the edge
 * runtime as well as for node, and an edge build refuses a node: import
 * outright, which stops the whole development server with a build error. The
 * token comes from the Web Crypto that both runtimes already have.
 */
export async function register() {
  /* The edge runtime has no timers worth having and no database at all. */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  /*
    The office's own clock. Every day and time in the CRM is read in the time
    of the server, and a server abroad, Render's for one, runs on UTC, which
    put a ten o'clock appointment at seven and started "today" three hours
    late. Cyprus time unless TZ is set to something else on purpose.
  */
  if (!process.env.TZ) process.env.TZ = "Europe/Nicosia";

  /* Nothing to schedule during a build. */
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  process.env.OE_TICK_TOKEN = token;

  const port = process.env.PORT ?? "3000";
  const url = `http://127.0.0.1:${port}/api/appointments/summary`;
  const EVERY = 10 * 60 * 1000;

  const look = async () => {
    try {
      const answer = await fetch(url, {
        method: "POST",
        headers: { "X-Internal-Tick": token, "Content-Type": "application/json" },
        body: JSON.stringify({ due: true }),
      });
      if (!answer.ok) return;
      const result = (await answer.json()) as { sent?: number; of?: number; skipped?: boolean };
      if (result.skipped) return;
      console.log(`[appointments] evening summary: ${result.sent} of ${result.of} sent`);
    } catch {
      /* The app may not be listening yet, or may be busy. It will be asked
         again in ten minutes, and a late summary is worth more than none. */
    }
  };

  /* A first look a minute after start, in case the machine was asleep at nine. */
  const first = setTimeout(look, 60 * 1000);
  const every = setInterval(look, EVERY);

  /* Timers that hold the process open are how a container refuses to stop. */
  if (typeof first.unref === "function") first.unref();
  if (typeof every.unref === "function") every.unref();
}
