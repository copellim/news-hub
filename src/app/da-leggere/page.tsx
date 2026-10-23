import { ReadingQueueBoard } from "@/components/ReadingQueueBoard";

export default function ReadingQueuePage() {
  return (
    <div data-section="queue" className="flex flex-col gap-4">
      <p className="max-w-[66ch] px-1 text-sm leading-relaxed text-muted sm:px-4">
        I segnalibri stanno nel tuo account: li ritrovi su qualunque dispositivo
        da cui accedi con Google.
      </p>
      <ReadingQueueBoard />
    </div>
  );
}
