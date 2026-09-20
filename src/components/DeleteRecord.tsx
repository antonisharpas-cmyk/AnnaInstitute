import Disclosure from "@/components/Disclosure";
import SubmitButton from "@/components/SubmitButton";

/**
 * Deleting a record, behind one deliberate step.
 *
 * Every record in the CRM can be got rid of, but not by a button sitting in
 * reach of a mis-click. So the button is behind a disclosure, and opening it
 * says in plain words what else goes with the record, because the thing people
 * actually regret is not the delete they meant but the four other records they
 * did not know were attached to it.
 *
 * When something is in the way, the reason is shown instead of the button. A
 * refusal that names what to do first is worth more than a button that fails.
 */
export default function DeleteRecord({
  action,
  label,
  what,
  blocked,
  confirm,
}: {
  action: () => void | Promise<void>;
  /** "Delete this development" */
  label: string;
  /** What goes with it, in a sentence. */
  what: string;
  /** Why it cannot be deleted yet, if it cannot. */
  blocked?: string | null;
  /** The word on the button that does it. */
  confirm: string;
}) {
  return (
    <div className="rounded border border-brand-line bg-brand-surface p-3">
      <Disclosure showLabel={label} hideLabel={confirm.length > 0 ? label : label} tone="secondary">
        <div className="space-y-2">
          <p className="max-w-prose text-xs text-brand-graphite/70">{what}</p>
          {blocked ? (
            <p className="max-w-prose rounded border border-[color:var(--color-negative)] bg-brand-paper px-3 py-2 text-xs text-[color:var(--color-negative)]">
              {blocked}
            </p>
          ) : (
            <form action={action}>
              <SubmitButton className="btn btn-danger">{confirm}</SubmitButton>
            </form>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
