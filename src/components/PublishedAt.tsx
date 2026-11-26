const relativeTime = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

const absoluteTime = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/**
 * The age ("16 ore fa", 16 hours ago) exists only after mount: before that, and
 * in the server render, there is the absolute date, which does not depend on
 * when the cache was born.
 */
export function PublishedAt({ iso, now }: { iso: string; now: number | null }) {
  const absolute = absoluteTime.format(new Date(iso));
  return (
    <time dateTime={iso} title={absolute}>
      {now === null ? absolute : ageLabel(iso, now)}
    </time>
  );
}

function ageLabel(iso: string, now: number): string {
  const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) {
    return relativeTime.format(-minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return relativeTime.format(-hours, "hour");
  }
  // With `numeric: "auto"` -1 becomes "ieri" (yesterday) and -2 "l'altro ieri"
  // (the day before yesterday).
  return relativeTime.format(-Math.floor(hours / 24), "day");
}
