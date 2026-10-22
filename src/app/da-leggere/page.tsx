import { ReadingQueueBoard } from "@/components/ReadingQueueBoard";

export default function ReadingQueuePage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs opacity-60">
        I segnalibri stanno nel tuo account: li ritrovi su qualunque dispositivo
        da cui accedi con Google.
      </p>
      <ReadingQueueBoard />
    </div>
  );
}
