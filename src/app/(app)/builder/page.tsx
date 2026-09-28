import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { LISTS, SECTIONS, isListKey, labelKey, listEntries, LIST_BY_KEY, type ListKey } from "@/lib/choices";
import { usageOf } from "@/lib/choices/usage";
import { Card, PageHeader, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addChoice, removeChoice, saveChoice } from "./actions";

/**
 * The Builder: the office's own lists.
 *
 * On the left, every list the office picks from, grouped by the part of the CRM
 * it belongs to. On the right, the one that is open: each value with its name
 * in both languages, what it counts as, how many records hold it, and whether
 * it is offered. Underneath, the form that adds a new one.
 */
export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  await requireUser(["ADMIN"]);
  const { t } = await getTranslator();
  const params = await searchParams;
  const list: ListKey = params.list && isListKey(params.list) ? params.list : LISTS[0].key;
  const def = LIST_BY_KEY[list];

  const [entries, usage] = await Promise.all([listEntries(list), usageOf(list)]);
  const word = (code: string) => t(labelKey(list, code) as MessageKey);
  const bases = def.builtins.filter((one) => !one.auto);

  return (
    <>
      <PageHeader title={t("builder.title")} subtitle={t("builder.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="card self-start p-3" aria-label={t("builder.title")}>
          {SECTIONS.map((section) => (
            <div key={section} className="mb-3 last:mb-0">
              <p className="navgroup !px-2">{t(`builder.section.${section}` as MessageKey)}</p>
              {LISTS.filter((one) => one.section === section).map((one) => (
                <Link
                  key={one.key}
                  href={`/builder?list=${one.key}`}
                  className={`navlink ${one.key === list ? "navlink-active" : ""}`}
                  data-list={one.key}
                >
                  {t(`builder.list.${one.key}` as MessageKey)}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          <Card title={`${t(`builder.section.${def.section}` as MessageKey)} . ${t(`builder.list.${list}` as MessageKey)}`} flush>
            <p className="px-4 pt-3 text-sm text-brand-graphite/70">{t(`builder.hint.${list}` as MessageKey)}</p>
            <p className="px-4 pb-1 pt-1 text-xs text-brand-graphite/55">{t("builder.inactiveNote")}</p>

            <div className="overflow-x-auto">
              <table className="data" data-builder={list} data-nosort="true">
                <thead>
                  <tr>
                    <th className="w-20">{t("builder.order")}</th>
                    <th>{t("builder.nameEn")}</th>
                    <th>{t("builder.nameEl")}</th>
                    <th>{t("builder.kind")}</th>
                    <th className="ctr">{t("builder.inUse")}</th>
                    <th className="ctr">{t("builder.state")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => {
                    const formId = `choice-${index}`;
                    const used = usage.get(entry.code) ?? 0;
                    return (
                      <tr key={entry.code} data-code={entry.code} className={entry.active ? "" : "opacity-60"}>
                        <td className="nowrap">
                          <form id={formId} action={saveChoice}>
                            <input type="hidden" name="list" value={list} />
                            <input type="hidden" name="code" value={entry.code} />
                            {/* Enter in a name saves it, rather than moving the row. */}
                            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                              {t("builder.save")}
                            </button>
                          </form>
                          <div className="flex gap-1">
                            <button
                              type="submit"
                              form={formId}
                              name="move"
                              value="up"
                              disabled={index === 0}
                              className="btn btn-secondary !px-2 !py-0.5 !text-xs"
                              aria-label={t("builder.up")}
                              title={t("builder.up")}
                            >
                              {"↑"}
                            </button>
                            <button
                              type="submit"
                              form={formId}
                              name="move"
                              value="down"
                              disabled={index === entries.length - 1}
                              className="btn btn-secondary !px-2 !py-0.5 !text-xs"
                              aria-label={t("builder.down")}
                              title={t("builder.down")}
                            >
                              {"↓"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <input
                            form={formId}
                            name="labelEn"
                            defaultValue={entry.labelEn ?? entry.defaultEn}
                            required={!entry.builtin}
                            aria-label={t("builder.nameEn")}
                            className="input !py-1 text-sm"
                          />
                        </td>
                        <td>
                          <input
                            form={formId}
                            name="labelEl"
                            defaultValue={entry.labelEl ?? (entry.builtin ? entry.defaultEl : "")}
                            aria-label={t("builder.nameEl")}
                            className="input !py-1 text-sm"
                          />
                        </td>
                        <td className="text-xs">
                          {entry.builtin ? (
                            entry.auto ? (
                              <Pill tone="teal">{t("builder.byCrm")}</Pill>
                            ) : (
                              <Pill>{t("builder.builtin")}</Pill>
                            )
                          ) : (
                            <div className="whitespace-nowrap">
                              <Pill tone="good">{t("builder.own")}</Pill>
                              <div className="mt-1 text-brand-graphite/60">
                                {t("builder.countsAs")} {word(entry.base)}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="ctr">{used}</td>
                        <td className="ctr nowrap">
                          {entry.locked ? (
                            <span className="text-xs text-brand-graphite/55" title={t("builder.needed")}>
                              {t("builder.on")}
                            </span>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              {entry.active ? <Pill tone="good">{t("builder.on")}</Pill> : <Pill>{t("builder.off")}</Pill>}
                              <button
                                type="submit"
                                form={formId}
                                name="toggle"
                                value={entry.active ? "off" : "on"}
                                className="text-xs text-brand-teal-dark hover:underline"
                              >
                                {entry.active ? t("builder.switchOff") : t("builder.switchOn")}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="nowrap">
                          <div className="flex items-center gap-2">
                            <button type="submit" form={formId} className="btn btn-primary !px-3 !py-1 !text-xs">
                              {t("builder.save")}
                            </button>
                            {entry.builtin ? null : (
                              <form action={removeChoice}>
                                <input type="hidden" name="list" value={list} />
                                <input type="hidden" name="code" value={entry.code} />
                                <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                                  {t("builder.remove")}
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t("builder.add")}>
            <p className="mb-3 text-sm text-brand-graphite/70">{t("builder.addNote")}</p>
            <form action={addChoice} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" data-add={list}>
              <input type="hidden" name="list" value={list} />
              <div>
                <label className="label" htmlFor="newEn">
                  {t("builder.nameEn")}
                </label>
                <input id="newEn" name="labelEn" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="newEl">
                  {t("builder.nameEl")}
                </label>
                <input id="newEl" name="labelEl" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="countsAs">
                  {t("builder.countsAs")}
                </label>
                <select id="countsAs" name="countsAs" required className="select" defaultValue="">
                  <option value="" disabled>
                    {t("builder.countsAs")}
                  </option>
                  {bases.map((one) => (
                    <option key={one.code} value={one.code}>
                      {word(one.code)}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton>{t("builder.addButton")}</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
