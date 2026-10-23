import type { Viewport } from "next";

import { ReadingQueueBoard } from "@/components/ReadingQueueBoard";
import { themeColorOf } from "@/lib/sections";

export const viewport: Viewport = { themeColor: themeColorOf("queue") };

export default function ReadingQueuePage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[66ch] px-1 text-sm leading-relaxed text-muted sm:px-4">
        I segnalibri stanno nel tuo account: li ritrovi su qualunque dispositivo
        da cui accedi con Google.
      </p>
      <ReadingQueueBoard />
    </div>
  );
}
