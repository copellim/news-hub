import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";

/**
 * Login Google senza database: Better Auth senza `database` passa da solo alla
 * modalità stateless, con la sessione in un cookie cifrato (7 giorni). Il
 * rovescio è che una singola sessione non si può revocare: si invalidano
 * tutte cambiando `BETTER_AUTH_SECRET`.
 *
 * È un portale personale: entra solo chi sta in `ALLOWED_EMAILS`.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Senza database l'utente vive nell'adapter in memoria e di norma viene
        // ricreato a ogni login: qui si respinge chi non è in lista prima che
        // riceva un cookie. `getSignedInEmail` ricontrolla comunque.
        before: async (user) => isAllowedEmail(user.email),
      },
    },
  },
  // Deve restare l'ultimo plugin: imposta i cookie anche dalle Server Action.
  plugins: [nextCookies()],
});

/**
 * L'email dell'utente se è loggato **e** ammesso, altrimenti `null`. Il
 * controllo sull'allowlist si ripete qui perché l'hook di login non copre una
 * sessione aperta prima che un'email venisse tolta dalla lista.
 */
export async function getSignedInEmail(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user.email;
  return email && isAllowedEmail(email) ? normalizeEmail(email) : null;
}

function isAllowedEmail(email: string): boolean {
  return allowedEmails().has(normalizeEmail(email));
}

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
