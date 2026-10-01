"use client";

import { useState } from "react";
import { baseOf } from "@/lib/choices/lists";
import SearchSelect from "@/components/SearchSelect";

/*
 * Where a client came from, and, when an agent brought them, which agent.
 *
 * Choosing Agent Referral, or one of the office's own sources that counts as
 * it, opens a searchable list of the agents, and the agent chosen is kept on
 * the client, so the contract later picks it up and the commission has an
 * owner.
 */
export default function SourceAgentFields({
  sources,
  agents,
  defaultSource,
  defaultAgentId,
  labels,
  row = false,
}: {
  sources: { value: string; label: string }[];
  agents: { value: string; label: string; hint?: string }[];
  defaultSource: string;
  defaultAgentId?: string | null;
  labels: { source: string; agent: string; choose: string; search: string; noMatch: string };
  /** Label beside the box, as on the client's own card, rather than above it. */
  row?: boolean;
}) {
  const [source, setSource] = useState(defaultSource);
  const byAgent = baseOf(source) === "AGENT_REFERRAL";
  const wrap = row ? "flex flex-wrap items-center gap-2 border-b border-brand-line py-2" : "";
  const labelClass = row ? "label !mb-0 w-44 shrink-0" : "label";
  const boxClass = row ? "max-w-sm flex-1" : "";

  return (
    <>
      <div className={wrap}>
        <label className={labelClass} htmlFor="source">
          {labels.source}
        </label>
        <select
          id="source"
          name="source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className={`select ${boxClass}`}
        >
          {sources.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
      </div>
      {byAgent ? (
        <div className={wrap} data-referral-agent>
          <label className={labelClass} htmlFor="agentId">
            {labels.agent}
          </label>
          <div className={boxClass || "w-full"}>
            <SearchSelect
              id="agentId"
              name="agentId"
              required
              defaultValue={defaultAgentId ?? ""}
              choose={labels.choose}
              searchPlaceholder={labels.search}
              noMatch={labels.noMatch}
              options={agents}
            />
          </div>
        </div>
      ) : (
        <input type="hidden" name="agentId" value="" />
      )}
    </>
  );
}
