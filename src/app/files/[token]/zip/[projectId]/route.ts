import path from "node:path";
import { campaignFolders, resolveFilesToken } from "@/lib/campaignFiles";
import { resolveStored } from "@/lib/storage";
import { uniqueNames, zipStream } from "@/lib/zipStream";

/**
 * Everything of one development on a campaign's files page, as one zip: its
 * brochure, drawings, specifications and renders, each in its own folder, so an
 * agent can keep it or pass it on in one go. "other" is the files uploaded with
 * the campaign itself.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string; projectId: string }> }) {
  const { token, projectId } = await context.params;
  const link = await resolveFilesToken(token);
  if (!link?.campaignId) return new Response("Not found", { status: 404 });

  const { folders, other } = await campaignFolders(link.campaignId);
  const folder = folders.find((one) => one.projectId === projectId);
  const picked =
    projectId === "other"
      ? { name: "Other files", files: other.map((doc) => ({ folder: "", doc })) }
      : folder
        ? { name: folder.name, files: folder.groups.flatMap((group) => group.files.map((doc) => ({ folder: group.label, doc }))) }
        : null;
  if (!picked || picked.files.length === 0) return new Response("Not found", { status: 404 });

  const names = uniqueNames(
    picked.files.map(({ folder: inside, doc }) => {
      const name = (doc.originalName ?? path.basename(doc.filePath)).replace(/[\\/]/g, "_");
      return inside ? `${inside}/${name}` : name;
    }),
  );
  const entries = picked.files.map(({ doc }, i) => ({ name: names[i], path: resolveStored(doc.filePath) }));

  const zipName = `${picked.name}.zip`;
  return new Response(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
