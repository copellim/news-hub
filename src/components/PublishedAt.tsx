const relativeTime = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

const absoluteTime = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

/**
 * L'età ("16 ore fa") esiste solo dopo il montaggio: prima, e nel render del
 * server, c'è la data assoluta, che non dipende da quando la cache è nata.
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
  // Con `numeric: "auto"` -1 diventa "ieri" e -2 "l'altro ieri".
  return relativeTime.format(-Math.floor(hours / 24), "day");
}
