import { ReadingQueueBoard } from "@/components/ReadingQueueBoard";

export default function ReadingQueuePage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs opacity-60">
        I segnalibri vivono nel localStorage di questo browser: non lasciano il
        computer e non sono condivisi fra profili. Per portarli altrove c&apos;è
        Esporta, in alto a destra.
      </p>
      <ReadingQueueBoard />
    </div>
  );
}
