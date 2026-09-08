import type { documents as documentsTable } from "@/db/schema";
import { categoryLabel, titleWithExtension } from "@/lib/fileLabels";
import { Empty, Pill } from "./ui";

type Doc = typeof documentsTable.$inferSelect;

const kb = (bytes: number | null) =>
  bytes === null ? "" : bytes > 900_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function DocumentList({
  items,
  emptyMessage,
  locale = "en",
  action,
}: {
  items: Doc[];
  emptyMessage: string;
  locale?: string;
  action?: (doc: Doc) => React.ReactNode;
}) {
  if (items.length === 0) return <Empty message={emptyMessage} />;

  return (
    <ul className="divide-y divide-brand-line text-sm">
      {items.map((doc) => (
        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0">
            <a
              href={`/api/files/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-teal-dark hover:underline"
            >
              {titleWithExtension(doc)}
            </a>
            <div className="text-xs text-brand-graphite/60">
              {kb(doc.sizeBytes)} .{" "}
              {new Date(doc.createdAt).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>{categoryLabel(doc.category)}</Pill>
            <a
              href={`/api/files/${doc.id}?download=1`}
              className="btn btn-secondary !px-2 !py-1 !text-xs"
            >
              Download
            </a>
            {action ? action(doc) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
