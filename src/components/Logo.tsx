import Image from "next/image";

/**
 * The One Eleven lockup, taken from the client's own logo.
 * Replace public/brand/oneeleven-logo.png with the original artwork when they
 * send it, and nothing else needs to change.
 */
export default function Logo({ width = 130 }: { width?: number }) {
  return (
    <Image
      src="/brand/oneeleven-logo.png"
      alt="One Eleven"
      width={width}
      height={Math.round((width * 264) / 426)}
      style={{ height: "auto" }}
      priority
    />
  );
}
