"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, ConfirmActionDialog, SelectInput, StatusBadge, isStatusKey, useToast } from "@/components/admin-ui";
import { AuthApiError } from "@/features/auth/services/auth-client";
import { api } from "@/lib/api";
import type { RecordRow } from "../../data/records";
import { formatDateTime } from "../../format";
import { userNames } from "../../services/lookups";
import { usePanel } from "../../shell/PanelContext";

/*
 * Dealer extras: the application history (GET /dealer/dealers/:id/history) in the detail drawer, and
 * the registration-mode setting (GET/PUT /dealer/settings/registration-mode) above the list, Super Admin only.
 */

interface HistoryEntry {
  seq: number;
  event: string;
  status: string;
  snapshot: Record<string, unknown>;
  actorId: string;
  reason: string | null;
  at: string;
}

const humanize = (value: string) => {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : value;
};

export function DealerHistory({ row }: { row: RecordRow; onChanged: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [who, setWho] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .get<{ history: HistoryEntry[] }>(`/dealer/dealers/${row.id}/history`)
      .then(async (res) => {
        const names = await userNames().catch(() => new Map<string, string>());
        if (!live) return;
        setWho(names);
        setHistory(res.history);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [row.id, row.status, attempt]);

  return (
    <section aria-label="Application history">
      <h3 className="mb-3 text-[15px] font-semibold">Application history</h3>
      {failed ? (
        <p className="text-[13px] fx-muted">
          Couldn&rsquo;t load the history.{" "}
          <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : history === null ? (
        <p className="text-[13px] fx-muted">Loading…</p>
      ) : !history.length ? (
        <p className="text-[13px] fx-muted">No history yet.</p>
      ) : (
        <ol className="grid gap-3 border-l border-[var(--fx-border)] pl-4">
          {history.map((entry) => (
            <li key={entry.seq} className="grid gap-1 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{humanize(entry.event)}</span>
                {isStatusKey(entry.status) ? <StatusBadge status={entry.status} /> : <Badge tone="neutral">{humanize(entry.status)}</Badge>}
              </div>
              <span className="fx-muted">
                {formatDateTime(entry.at)} · {who.get(entry.actorId) ?? "Staff member"}
              </span>
              {entry.reason ? <span className="break-words">“{entry.reason}”</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type Mode = "public" | "invitation_only";
interface RegistrationMode {
  mode: Mode | null;
  rev: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

const MODE_LABEL: Record<Mode, string> = { public: "Public: anyone can apply", invitation_only: "By invitation only" };

/** Super Admin only (the API answers 403 to everyone else); renders nothing for other users. */
export function RegistrationModeCard() {
  const { access } = usePanel();
  const toast = useToast();
  const [setting, setSetting] = useState<RegistrationMode | null>(null);
  const [choice, setChoice] = useState<Mode | "">("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = access?.isSuperAdmin === true;

  useEffect(() => {
    if (!isSuperAdmin) return;
    let live = true;
    api
      .get<{ registrationMode: RegistrationMode }>("/dealer/settings/registration-mode")
      .then((res) => {
        if (!live) return;
        setSetting(res.registrationMode);
        setChoice(res.registrationMode.mode ?? "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [isSuperAdmin]);

  if (!isSuperAdmin || !setting) return null;

  async function save(reason?: string) {
    if (!setting || !choice) return;
    setConfirming(false);
    setBusy(true);
    try {
      const res = await api.put<{ registrationMode: RegistrationMode }>("/dealer/settings/registration-mode", { mode: choice, rev: setting.rev, reason: reason ?? "" });
      setSetting(res.registrationMode);
      toast(`Dealer registration is now ${MODE_LABEL[choice].toLowerCase()}.`);
    } catch (error) {
      toast(error instanceof AuthApiError && error.message ? error.message : "Couldn't change the setting. Nothing was changed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="fx-label">Dealer registration</p>
          <p className="mt-1 text-[13px] fx-muted">
            {setting.mode ? `Currently ${MODE_LABEL[setting.mode].toLowerCase()}` : "Not chosen yet"}
            {setting.updatedAt ? ` · changed ${formatDateTime(setting.updatedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput aria-label="Dealer registration mode" value={choice} onChange={(e) => setChoice(e.target.value as Mode | "")} disabled={busy}>
            <option value="" disabled>
              Choose…
            </option>
            {(Object.keys(MODE_LABEL) as Mode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </option>
            ))}
          </SelectInput>
          <Button variant="primary" disabled={busy || !choice || choice === setting.mode} onClick={() => setConfirming(true)}>
            Change
          </Button>
        </div>
      </div>
      {confirming && choice ? (
        <ConfirmActionDialog
          open
          kind="destructive"
          title="Change dealer registration"
          description="This changes who can apply to become a dealer, for the whole network."
          record={MODE_LABEL[choice]}
          confirmLabel="Change setting"
          reason={{ label: "Reason for the change", min: 3 }}
          onClose={() => setConfirming(false)}
          onConfirm={(reason) => void save(reason)}
        />
      ) : null}
    </Card>
  );
}
