"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a campaign is sending, the page reads itself again every few seconds. */
export default function KeepFresh({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), every);
    return () => clearInterval(timer);
  }, [router, every]);
  return null;
}
