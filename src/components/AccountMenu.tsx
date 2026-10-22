"use client";

import { authClient } from "@/lib/auth-client";
import { clearSettings, useSettingsStatus } from "@/lib/settings";

const BUTTON_CLASS =
  "rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

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
    <div className="flex items-center gap-1.5 text-xs">
      {settingsStatus === "error" && (
        <span
          className="text-amber-700 dark:text-amber-300"
          title="Segnalibri e letti non sono stati caricati: vedi la console"
        >
          stato non disponibile
        </span>
      )}
      <span className="hidden opacity-60 sm:inline">{session.user.email}</span>
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
