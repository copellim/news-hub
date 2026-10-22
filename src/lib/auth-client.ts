"use client";

import { createAuthClient } from "better-auth/react";

/** Stessa origine dell'app: Better Auth risponde sotto `/api/auth`. */
export const authClient = createAuthClient();
