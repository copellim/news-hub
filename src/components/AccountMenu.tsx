"use client";

import { authClient } from "@/lib/auth-client";
import { clearSettings, useSettingsStatus } from "@/lib/settings";

/** Pulsante di testo di M3: niente contorno, livello di stato a pillola. */
const BUTTON_CLASS =
  "state-layer -mr-3 h-10 rounded-full px-3 text-sm font-medium text-accent";

/**
 * Accesso con Google. Le news e i paper si leggono anche senza; segnalibri,
 * letti e la generazione dei riassunti richiedono un account in allowlist.
 */
export function AccountMenu() {
  const { data: session, isPending } = authClient.useSession();
  const settingsStatus = useSettingsStatus();

  if (isPending) {
    return null;
  }

  if (!session) {
    return (
      <button
        type="button"
        onClick={() =>
          void authClient.signIn.social({
            provider: "google",
            // Dopo il login si torna alla pagina da cui si è partiti.
            callbackURL: window.location.pathname,
          })
        }
        className={BUTTON_CLASS}
      >
        Accedi con Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {settingsStatus === "error" && (
        <span
          className="text-warn-ink"
          title="Segnalibri e letti non sono stati caricati: vedi la console"
        >
          stato non disponibile
        </span>
      )}
      <span className="hidden text-muted sm:inline">{session.user.email}</span>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          clearSettings();
        }}
        className={BUTTON_CLASS}
      >
        Esci
      </button>
    </div>
  );
}
