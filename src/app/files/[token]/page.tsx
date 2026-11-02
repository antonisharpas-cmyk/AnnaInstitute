import { notFound } from "next/navigation";
import { campaignFolders, recordFilesOpen, resolveFilesToken } from "@/lib/campaignFiles";
import { extensionOf, titleWithExtension } from "@/lib/fileLabels";
import Logo from "@/components/Logo";
import { isPicture } from "@/lib/campaignProjects";

/**
 * The files of one campaign, for whoever received it, by email or by SMS.
 *
 * No login and no personal data. A folder for each development, so it is
 * always clear which brochure, drawing or render belongs to which; inside it
 * the brochure, the architectural drawings, the technical specifications and
 * the renders, and a button that downloads the whole development as one zip.
 * The renders show as small previews, the full picture opening when tapped.
 *
 * A person's own link counts that they opened it, for the campaign's page.
 */
export const dynamic = "force-dynamic";

type Doc = Awaited<ReturnType<typeof campaignFolders>>["other"][number];

function FileRows({ files, token }: { files: Doc[]; token: string }) {
  return (
    <ul className="divide-y divide-brand-line rounded border border-brand-line bg-white">
      {files.map((file) => (
        <li key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-brand-ink">{titleWithExtension(file)}</span>
            <span className="text-xs uppercase tracking-wide text-brand-graphite/50">
              {extensionOf(file).replace(".", "") || "file"}
            </span>
          </span>
          <a href={`/files/${token}/${file.id}`} target="_blank" rel="noreferrer" className="btn btn-primary !px-3 !py-1 !text-xs">
            Open
          </a>
        </li>
      ))}
    </ul>
  );
}

function Pictures({ files, token }: { files: Doc[]; token: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-gallery>
      {files.map((file) => (
        <a key={file.id} href={`/files/${token}/${file.id}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/files/${token}/${file.id}?size=small`}
            alt={titleWithExtension(file)}
            className="aspect-[4/3] w-full rounded border border-brand-line object-cover"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 flex-none fill-brand-teal">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

export default async function CampaignFilesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveFilesToken(token);
  if (!link?.campaignId) notFound();

  const [{ folders, other }] = await Promise.all([campaignFolders(link.campaignId), recordFilesOpen(link)]);
  const nothing = folders.length === 0 && other.length === 0;
  /* One development opens by itself; several start closed, so the list of developments is what is seen first. */
  const openFirst = folders.length + (other.length > 0 ? 1 : 0) === 1;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-8">
        <Logo />
      </div>

      <h1 className="mb-1 text-2xl font-semibold text-brand-ink">Your files</h1>
      <p className="mb-6 text-sm text-brand-graphite/70">
        {folders.length > 1
          ? "A folder for each development. Tap one to see its files."
          : "The documents from our message. Tap one to open it."}
      </p>

      {nothing ? <p className="text-sm text-brand-graphite/60">There is nothing attached to this link.</p> : null}

      <div className="space-y-3">
        {folders.map((folder) => (
          <details key={folder.projectId} open={openFirst} className="group rounded border border-brand-line bg-white" data-folder>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              <FolderIcon />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-brand-ink">{folder.name}</span>
                <span className="text-xs text-brand-graphite/60">
                  {folder.groups.map((group) => group.label).join(", ")}
                </span>
              </span>
              <span className="text-xs text-brand-graphite/50 group-open:rotate-90" aria-hidden>
                ▶
              </span>
            </summary>
            <div className="space-y-4 border-t border-brand-line px-4 py-4">
              {folder.groups.map((group) => (
                <section key={group.kind} data-group={group.kind}>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-graphite/60">{group.label}</h2>
                  {group.files.every(isPicture) ? (
                    <Pictures files={group.files} token={token} />
                  ) : (
                    <>
                      {group.files.some(isPicture) ? <Pictures files={group.files.filter(isPicture)} token={token} /> : null}
                      <FileRows files={group.files.filter((file) => !isPicture(file))} token={token} />
                    </>
                  )}
                </section>
              ))}
              <a href={`/files/${token}/zip/${folder.projectId}`} className="btn btn-secondary w-full justify-center" data-download-all>
                Download all of {folder.name} (zip)
              </a>
            </div>
          </details>
        ))}

        {other.length > 0 ? (
          <details open={openFirst} className="group rounded border border-brand-line bg-white" data-folder>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              <FolderIcon />
              <span className="min-w-0 flex-1 font-semibold text-brand-ink">Other files</span>
              <span className="text-xs text-brand-graphite/50 group-open:rotate-90" aria-hidden>
                ▶
              </span>
            </summary>
            <div className="space-y-4 border-t border-brand-line px-4 py-4">
              {other.some(isPicture) ? <Pictures files={other.filter(isPicture)} token={token} /> : null}
              {other.some((file) => !isPicture(file)) ? <FileRows files={other.filter((file) => !isPicture(file))} token={token} /> : null}
              {other.length > 1 ? (
                <a href={`/files/${token}/zip/other`} className="btn btn-secondary w-full justify-center" data-download-all>
                  Download all (zip)
                </a>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
