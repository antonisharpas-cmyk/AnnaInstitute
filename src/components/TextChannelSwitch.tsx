import type { TextChannel } from "@/lib/textChannel";

/**
 * Two buttons, SMS and WhatsApp: how the office texts this person.
 *
 * The one in use is filled in; pressing the other saves it at once. The
 * appointment messages and the text part of every campaign follow it.
 */
export default function TextChannelSwitch({
  action,
  current,
  labels,
}: {
  action: (formData: FormData) => Promise<void>;
  current: TextChannel;
  labels: { title: string; hint: string; sms: string; whatsapp: string };
}) {
  const button = (value: TextChannel, label: string) => {
    const on = current === value;
    return (
      <button
        type="submit"
        name="channel"
        value={value}
        aria-pressed={on}
        data-text-channel={value}
        data-on={on ? "yes" : "no"}
        className={`btn !px-4 !py-1.5 !text-sm ${on ? "btn-primary" : "btn-secondary"}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="card p-4" data-text-channel-switch>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{labels.title}</div>
          <p className="mt-0.5 max-w-prose text-xs text-brand-graphite/60">{labels.hint}</p>
        </div>
        <form action={action} className="flex gap-2">
          {button("SMS", labels.sms)}
          {button("WHATSAPP", labels.whatsapp)}
        </form>
      </div>
    </div>
  );
}
