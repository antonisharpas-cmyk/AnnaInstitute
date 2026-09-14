import { CATEGORY_LABELS } from "@/lib/fileLabels";
import type { DocumentCategory } from "@/lib/uploads";
import SubmitButton from "@/components/SubmitButton";

export default function UploadForm({
  action,
  categories,
  defaultCategory,
  submitLabel,
  titlePlaceholder,
  hint,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categories: DocumentCategory[];
  defaultCategory: DocumentCategory;
  submitLabel: string;
  titlePlaceholder?: string;
  hint?: string;
}) {
  const id = `upload-${defaultCategory}`;

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor={`${id}-files`}>
          Files
        </label>
        <input
          id={`${id}-files`}
          name="files"
          type="file"
          multiple
          required
          className="input !py-1.5 text-xs"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-title`}>
          Title
        </label>
        <input
          id={`${id}-title`}
          name="title"
          required
          placeholder={titlePlaceholder ?? "Floor Plan 101"}
          className="input"
        />
        <p className="mt-1 text-xs text-brand-graphite/60">
          Several files under one title are numbered, so three become 1, 2 and 3.
        </p>
      </div>
      <div>
        <label className="label" htmlFor={`${id}-category`}>
          Category
        </label>
        <select
          id={`${id}-category`}
          name="category"
          className="select"
          defaultValue={defaultCategory}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className="btn btn-primary w-full">{submitLabel}</SubmitButton>
      {hint ? <p className="text-xs text-brand-graphite/60">{hint}</p> : null}
    </form>
  );
}
