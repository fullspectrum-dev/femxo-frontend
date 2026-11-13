"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AccessDenied, Button, Card, ErrorState, LoadingSkeleton, ToastProvider } from "@/components/admin-ui";
import { RequireSession } from "@/features/auth";
import type { AuthUser } from "@/features/auth";
import { PANELS, canOpenPanel, homeFor } from "../panels";
import type { PanelId } from "../panels";
import { AdminShell } from "./AdminShell";
import { PanelProvider } from "./PanelContext";
import { useAccessSummary } from "./useAccessSummary";

/** The Super Admin panel (/admin). */
export function AdminGate({ children }: { children: ReactNode }) {
  return <PanelGate panelId="super-admin">{children}</PanelGate>;
}

/**
 * Signed-out visitors go to /login and come back here. Signed-in users may
 * open a panel when one of their roles matches it (the Super Admin may open
 * every panel). Anyone else is sent to their own panel, or shown "Access
 * denied" when no panel fits their roles.
 */
export function PanelGate({ panelId, children }: { panelId: PanelId; children: ReactNode }) {
  return (
    <RequireSession pendingClassName="grid min-h-dvh place-items-center p-6">
      {(user) => (
        <PanelAccess panelId={panelId} user={user}>
          {children}
        </PanelAccess>
      )}
    </RequireSession>
  );
}

function PanelAccess({ panelId, user, children }: { panelId: PanelId; user: AuthUser; children: ReactNode }) {
  const router = useRouter();
  const { access, loaded, failed, retry } = useAccessSummary();
  const panel = PANELS[panelId];
  const allowed = user.isSuperAdmin || (access !== null && canOpenPanel(panel, access));
  const elsewhere = !allowed && access ? homeFor(access) : null;

  useEffect(() => {
    if (elsewhere) router.replace(elsewhere);
  }, [elsewhere, router]);

  if (allowed) {
    return (
      <PanelProvider panelId={panelId} access={access}>
        <ToastProvider>
          <AdminShell user={user}>{children}</AdminShell>
        </ToastProvider>
      </PanelProvider>
    );
  }

  if (!loaded || elsewhere) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <Card className="w-full max-w-md">
          <ErrorState
            title="Couldn’t check your access"
            message="We couldn’t reach the server to load your role. Check your connection and try again."
            action={
              <Button variant="primary" onClick={retry}>
                Try again
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md">
        <AccessDenied
          message={`The ${panel.name} panel is not open to your role. Ask the Super Admin to give you a role.`}
          action={
            <Link href="/account" className="fx-btn fx-btn--secondary">
              Back to your account
            </Link>
          }
        />
      </Card>
    </div>
  );
}
