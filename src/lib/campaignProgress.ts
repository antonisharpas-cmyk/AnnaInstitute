import "server-only";

/**
 * Which campaigns are being sent right now, in this running CRM, and how far
 * each has got.
 *
 * A campaign is sent in the background: pressing Send starts it and answers at
 * once, and the campaign's page shows how many have gone while the rest go. If
 * the CRM restarts half way, nothing is running for it any more, and the page
 * offers to carry on from where it stopped.
 */
type Run = { total: number; done: number; startedAt: number };

const store = globalThis as unknown as { campaignRuns?: Map<string, Run> };
const runs = () => (store.campaignRuns ??= new Map());

export function startRun(campaignId: string, total: number) {
  runs().set(campaignId, { total, done: 0, startedAt: Date.now() });
}
export function tickRun(campaignId: string) {
  const run = runs().get(campaignId);
  if (run) run.done += 1;
}
export function endRun(campaignId: string) {
  runs().delete(campaignId);
}
export function runOf(campaignId: string): Run | null {
  return runs().get(campaignId) ?? null;
}
