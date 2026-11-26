"use client";

import { createAuthClient } from "better-auth/react";

/** Same origin as the app: Better Auth answers under `/api/auth`. */
export const authClient = createAuthClient();
