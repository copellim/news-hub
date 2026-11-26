import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";

/**
 * Google sign-in without a database: Better Auth without `database` switches by
 * itself to stateless mode, with the session in an encrypted cookie (7 days).
 * The downside is that a single session cannot be revoked: they are all
 * invalidated by changing `BETTER_AUTH_SECRET`.
 *
 * It is a personal portal: only those listed in `ALLOWED_EMAILS` get in.
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
        // Without a database the user lives in the in-memory adapter and is
        // normally recreated at every sign-in: here whoever is not listed is
        // rejected before receiving a cookie. `getSignedInEmail` checks again anyway.
        before: async (user) => isAllowedEmail(user.email),
      },
    },
  },
  // Must stay the last plugin: it sets cookies from Server Actions too.
  plugins: [nextCookies()],
});

/**
 * The user's email if signed in **and** allowed, otherwise `null`. The
 * allowlist check is repeated here because the sign-in hook does not cover a
 * session opened before an email was removed from the list.
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
