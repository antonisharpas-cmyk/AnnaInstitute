import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { listTeam } from "@/lib/team";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import { addTeamMember, deleteTeamMember, updateTeamMember } from "../appointments/actions";

/**
 * The people in the office who go to the appointments.
 *
 * A name and an email address each. No logins, no roles, no passwords: the man
 * going to the tile shop on Thursday should be in the CRM in ten seconds, and
 * the email is there so the day's summary has somewhere to go.
 */
export default async function TeamPage() {
  await requireUser(["ADMIN"]);
  const { t } = await getTranslator();
  const rows = await listTeam();

  return (
    <>
      <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} />

      <Card>
        <div className="mb-4">
          <Disclosure showLabel={t("team.add")} hideLabel={t("common.cancel")}>
            <form
              action={addTeamMember}
              className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
            >
              <div>
                <label className="label" htmlFor="name">
                  {t("team.name")}
                </label>
                <input id="name" name="name" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="email">
                  {t("team.email")}
                </label>
                <input id="email" name="email" type="email" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="phone">
                  {t("team.phone")}
                </label>
                <input id="phone" name="phone" className="input" />
              </div>
              <div className="flex items-end">
                <SubmitButton>{t("common.save")}</SubmitButton>
              </div>
            </form>
          </Disclosure>
        </div>

        {rows.length === 0 ? (
          <Empty message={t("team.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("team.name")}</th>
                  <th>{t("leads.email")}</th>
                  <th>{t("team.phone")}</th>
                  <th className="ctr">{t("team.coming")}</th>
                  <th className="ctr">{t("team.waiting")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ member, coming, waiting }) => (
                  <tr key={member.id}>
                    <td className="font-semibold">{member.name}</td>
                    <td className="text-xs break-all">
                      {member.email ? (
                        <a
                          href={`mailto:${member.email}`}
                          className="text-brand-teal-dark hover:underline"
                        >
                          {member.email}
                        </a>
                      ) : (
                        <span className="text-brand-graphite/55">{t("team.noEmail")}</span>
                      )}
                    </td>
                    <td className="text-xs">{member.phone ?? ""}</td>
                    <td className="ctr">
                      {coming > 0 ? (
                        <Link
                          href={`/appointments?assignedTo=${member.id}`}
                          className="font-semibold text-brand-teal-dark hover:underline"
                          prefetch={false}
                        >
                          {coming}
                        </Link>
                      ) : (
                        coming
                      )}
                    </td>
                    <td className="ctr">
                      {waiting > 0 ? (
                        <Link
                          href={`/appointments?when=waiting&assignedTo=${member.id}`}
                          className="font-semibold text-brand-teal-dark hover:underline"
                          prefetch={false}
                        >
                          {waiting}
                        </Link>
                      ) : (
                        waiting
                      )}
                    </td>
                    <td>
                      <Pill tone={member.isActive ? "good" : "neutral"}>
                        {member.isActive ? t("team.active") : t("team.inactive")}
                      </Pill>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/appointments?assignedTo=${member.id}`}
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                          prefetch={false}
                        >
                          {t("appointments.theirs")}
                        </Link>
                        <Disclosure
                          showLabel={t("common.edit")}
                          hideLabel={t("common.cancel")}
                          tone="secondary"
                        >
                          <form
                            action={updateTeamMember.bind(null, member.id)}
                            className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3"
                          >
                            <div>
                              <label className="label">{t("team.name")}</label>
                              <input name="name" defaultValue={member.name} className="input" />
                            </div>
                            <div>
                              <label className="label">{t("team.email")}</label>
                              <input
                                name="email"
                                type="email"
                                defaultValue={member.email ?? ""}
                                className="input"
                              />
                            </div>
                            <div>
                              <label className="label">{t("team.phone")}</label>
                              <input
                                name="phone"
                                defaultValue={member.phone ?? ""}
                                className="input"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                name="isActive"
                                defaultChecked={member.isActive}
                              />
                              {t("team.active")}
                            </label>
                            <SubmitButton>{t("common.save")}</SubmitButton>
                          </form>
                        </Disclosure>
                        <ConfirmButton
                          action={deleteTeamMember.bind(null, member.id)}
                          label={t("common.delete")}
                          confirm={t("remove.sure")}
                          title={t("team.whatGoes")}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 max-w-prose text-xs text-brand-graphite/55">{t("team.hint")}</p>
      </Card>
    </>
  );
}
