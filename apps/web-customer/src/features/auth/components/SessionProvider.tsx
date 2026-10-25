"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isApiError } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import type { Customer, Session } from "@femxo/shared/contracts";
import { getAuthApi } from "@/lib/api";
import { setAccessToken } from "@/lib/token";
import { createRefreshGate } from "../refresh-gate";

/** checking: asking the refresh cookie · unavailable: couldn't tell (offline, server error), not the same as signed out. */
export type SessionStatus = "checking" | "signed-in" | "signed-out" | "unavailable";

interface SessionValue {
  status: SessionStatus;
  user: Customer | null;
  /** A first sign-in that still has to give a name. */
  isNewUser: boolean;
  /** The customer chose to sign out (as opposed to the session ending by itself): the page that asked decides where to go. */
  leftOnPurpose: boolean;
  signIn(session: Session): void;
  signOut(): Promise<void>;
  setUser(user: Customer): void;
  retry(): void;
}

interface SessionState {
  status: SessionStatus;
  user: Customer | null;
  isNewUser: boolean;
  leftOnPurpose: boolean;
  /** Seconds until the access token should be renewed; null when there is none. */
  renewAfter: number | null;
  /** Bumps on every new token, so the renewal timer restarts even when `renewAfter` repeats. */
  tokenVersion: number;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Renew a minute before the access token runs out. */
const RENEW_EARLY_SECONDS = 60;

const noSession = (status: SessionStatus, tokenVersion: number, leftOnPurpose = false): SessionState => ({
  status,
  user: null,
  isNewUser: false,
  leftOnPurpose,
  renewAfter: null,
  tokenVersion,
});

/**
 * Who is signed in. The access token stays in memory; on load, and a minute
 * before it expires, the httpOnly refresh cookie gets a new one. Pages ask
 * through useSession() and the guards, never the API.
 */
export function SessionProvider({ auth, children }: { auth?: AuthApi; children: ReactNode }) {
  const [state, setState] = useState<SessionState>(() => noSession("checking", 0));
  // The real client is built on first use: it needs the browser (IndexedDB), not the server render.
  const apiRef = useRef(auth);
  const api = useCallback(() => (apiRef.current ??= getAuthApi()), []);
  const [refresh] = useState(() => createRefreshGate(() => api().refresh()));

  const applySession = useCallback((session: Session) => {
    setAccessToken(session.accessToken);
    setState((current) => ({
      status: "signed-in",
      user: session.user,
      isNewUser: session.isNewUser,
      leftOnPurpose: false,
      renewAfter: Math.max(1, session.expiresIn - RENEW_EARLY_SECONDS),
      tokenVersion: current.tokenVersion + 1,
    }));
  }, []);

  const check = useCallback(async () => {
    try {
      applySession(await refresh());
    } catch (error) {
      setAccessToken(undefined);
      // No valid session is a plain sign-out; anything else we couldn't verify, so don't claim the customer is signed out.
      setState((current) => noSession(isApiError(error, "UNAUTHENTICATED") ? "signed-out" : "unavailable", current.tokenVersion + 1));
    }
  }, [applySession, refresh]);

  // On load: is the refresh cookie still good?
  useEffect(() => {
    void check();
  }, [check]);

  // Quietly renew before the access token runs out.
  useEffect(() => {
    if (state.renewAfter === null) return;
    const timer = setTimeout(() => void check(), state.renewAfter * 1000);
    return () => clearTimeout(timer);
  }, [state.renewAfter, state.tokenVersion, check]);

  const value = useMemo<SessionValue>(
    () => ({
      status: state.status,
      user: state.user,
      isNewUser: state.isNewUser,
      leftOnPurpose: state.leftOnPurpose,
      signIn: applySession,
      async signOut() {
        try {
          await api().logout();
        } finally {
          setAccessToken(undefined);
          setState((current) => noSession("signed-out", current.tokenVersion + 1, true));
        }
      },
      setUser: (user) => setState((current) => ({ ...current, user })),
      retry() {
        setState((current) => ({ ...noSession("checking", current.tokenVersion + 1) }));
        void check();
      },
    }),
    [state.status, state.user, state.isNewUser, state.leftOnPurpose, applySession, api, check]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>.");
  return session;
}
