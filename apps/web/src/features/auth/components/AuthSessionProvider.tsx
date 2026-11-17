"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { clearOfflineQueues } from "@/lib/offline-storage";
import { authApi } from "../services/auth-api";
import type { AuthUser } from "../types/auth";

type SessionStatus = "checking" | "signed-out" | "signed-in" | "unavailable";

interface AuthSessionValue {
  status: SessionStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  /** Re-reads the user, e.g. after a password change clears mustChangePassword. */
  reloadUser: () => Promise<AuthUser | null>;
}

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);

  const lastUserId = useRef<string | null>(null);

  const apply = useCallback((next: AuthUser | null) => {
    // Session ended, or someone else signed in: the previous person's offline work must not carry over.
    if (lastUserId.current && lastUserId.current !== (next?.id ?? null)) clearOfflineQueues();
    lastUserId.current = next?.id ?? null;
    setUser(next);
    setStatus(next ? "signed-in" : "signed-out");
    return next;
  }, []);

  // On a page load the access token is gone (it only lives in memory), so
  // swap the refresh cookie for a new one. The client shares one refresh
  // between callers, so Strict Mode's double effect is harmless.
  useEffect(() => {
    let active = true;
    authApi
      .restoreSession()
      .then((restored) => active && apply(restored))
      .catch(() => active && setStatus("unavailable"));
    return () => {
      active = false;
    };
  }, [apply]);

  const value = useMemo<AuthSessionValue>(
    () => ({
      status,
      user,
      signIn: async (email, password) => apply(await authApi.login(email, password))!,
      signOut: async () => {
        await authApi.logout().catch(() => undefined);
        clearOfflineQueues();
        apply(null);
      },
      reloadUser: async () => apply(await authApi.restoreSession()),
    }),
    [status, user, apply]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used within AuthSessionProvider.");
  return context;
}

/**
 * Where to go after sign-in: the `next` param if it is a path on this site, else the fallback.
 * Rejects protocol-relative (`//host`), backslash (`/\host`) and control-character tricks
 * (browsers strip tabs and newlines, so a tab between two slashes becomes `//host`).
 */
const UNSAFE = /[\\\u0000-\u001f\u007f]/;
export function safeNextPath(next: string | null | undefined, fallback = "/account") {
  if (!next || !next.startsWith("/") || UNSAFE.test(next)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  // "/%09/evil.com" decodes to a tab between the slashes, which a browser reads as "//evil.com".
  if (UNSAFE.test(decoded) || decoded.replace(/\s/g, "").startsWith("//")) return fallback;
  return next;
}
