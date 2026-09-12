import { notFound } from "next/navigation";
import { campaignAttachments, resolveFilesToken } from "@/lib/campaignFiles";
import { extensionOf, titleWithExtension } from "@/lib/fileLabels";
import Logo from "@/components/Logo";

/**
 * The files of one campaign, for somebody who received it on WhatsApp.
 *
 * No login and no personal data: the link opens the same documents the email
 * carried as attachments, nothing else.
 */
export default async function CampaignFilesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveFilesToken(token);
  if (!link?.campaignId) notFound();

  const files = await campaignAttachments(link.campaignId);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-8">
        <Logo />
      </div>

      <h1 className="mb-1 text-2xl font-semibold text-brand-ink">Your files</h1>
      <p className="mb-6 text-sm text-brand-graphite/70">
        The documents from our message. Tap one to open it.
      </p>

      {files.length === 0 ? (
        <p className="text-sm text-brand-graphite/60">There is nothing attached to this link.</p>
      ) : (
        <ul className="divide-y divide-brand-line rounded border border-brand-line bg-white">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-brand-ink">
                  {titleWithExtension(file)}
                </span>
                <span className="text-xs uppercase tracking-wide text-brand-graphite/50">
                  {extensionOf(file).replace(".", "") || "file"}
                </span>
              </span>
              <a
                href={`/files/${token}/${file.id}`}
                className="btn btn-primary !px-3 !py-1 !text-xs"
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
