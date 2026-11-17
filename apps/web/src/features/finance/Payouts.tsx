"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Dialog, ErrorState, FormField, PageHeader, SelectInput, Tabs, TextArea, TextInput, useToast } from "@/components/admin-ui";
import type { BadgeTone } from "@/components/admin-ui";
import { useAuthSession } from "@/features/auth";
import { idempotencyKey } from "@/lib/api";
import { financeApi, PAYOUT_STATUSES } from "./finance.api";
import type { OwnerType, Payout, PayoutAccount, PayoutStatus } from "./finance.api";
import { dateTime, errorCodeOf, errorText, money, SimpleTable, toPaise, useCan, usePaged } from "./kit";

const TONE: Record<PayoutStatus, BadgeTone> = { requested: "warning", approved: "info", processing: "info", paid: "success", rejected: "error", failed: "error" };
const OWNER: Record<OwnerType, string> = { dealer: "Dealer", sub_dealer: "Sub-Dealer" };

type Tab = "queue" | "request" | "accounts";

/** Payouts: request (maker), approve or reject (checker, never one's own), and the bank accounts they go to. */
export function PayoutsScreen() {
  const can = useCan();
  const tabs = useMemo(
    () =>
      [
        { key: "queue" as const, label: "Payouts" },
        ...(can("finance.payout.request") ? [{ key: "request" as const, label: "Request payout" }] : []),
        ...(can("finance.payout.view", "finance.payout-account.manage") ? [{ key: "accounts" as const, label: "Payout accounts" }] : []),
      ],
    [can]
  );
  const [tab, setTab] = useState<Tab>("queue");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payouts" description="A payout leaves the wallet when it is requested; a second person approves it before the bank is called." />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Payout views" idPrefix="payouts" />
      <div id="payouts-panel" role="tabpanel">
        {tab === "queue" ? <PayoutQueue /> : tab === "request" ? <RequestPayout onDone={() => setTab("queue")} /> : <PayoutAccounts />}
      </div>
    </div>
  );
}

function PayoutQueue() {
  const can = useCan();
  const toast = useToast();
  const { user } = useAuthSession();
  const [status, setStatus] = useState<PayoutStatus | "">("requested");
  const list = usePaged((cursor) => financeApi.payouts({ status: status || undefined, cursor }), [status]);
  const [rejecting, setRejecting] = useState<Payout | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const checker = can("finance.payout.approve");

  async function approve(p: Payout) {
    setBusy(p.id);
    try {
      await financeApi.approvePayout(p.id);
      toast(`Payout of ${money(p.amountPaise)} approved. The bank transfer is queued.`);
      list.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  }
  async function reject() {
    if (!rejecting || !reason.trim()) return;
    setBusy(rejecting.id);
    try {
      await financeApi.rejectPayout(rejecting.id, reason.trim());
      toast("Payout rejected. The money is back in the wallet.");
      setRejecting(null);
      setReason("");
      list.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Payout queue"
        action={
          <SelectInput aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as PayoutStatus | "")}>
            <option value="">All statuses</option>
            {PAYOUT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectInput>
        }
      />
      {list.error ? <ErrorState message={errorText(list.error)} action={<Button onClick={list.reload}>Retry</Button>} /> : null}
      <SimpleTable
        rows={list.items}
        rowKey={(p) => p.id}
        empty={list.loading ? "Loading…" : "No payouts."}
        cols={[
          { header: "Owner", cell: (p) => <><div className="font-medium">{p.ownerId}</div><div className="text-[12px] fx-muted">{OWNER[p.ownerType]}</div></> },
          { header: "Amount", align: "right", cell: (p) => money(p.amountPaise) },
          { header: "Note", hideOnMobile: true, cell: (p) => <>{p.note}{p.failureReason ? <div className="text-[12px] fx-muted">{p.failureReason}</div> : null}{p.utr ? <div className="text-[12px] fx-muted">UTR {p.utr}</div> : null}</> },
          { header: "Requested", hideOnMobile: true, cell: (p) => dateTime(p.createdAt) },
          { header: "Status", cell: (p) => <Badge tone={TONE[p.status]}>{p.status}</Badge> },
          {
            header: "",
            cell: (p) => {
              if (!checker || p.status !== "requested") return null;
              if (p.requestedBy === user?.id) return <span className="text-[12px] fx-muted">Your request: another person approves</span>;
              return (
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" disabled={busy === p.id} onClick={() => void approve(p)}>Approve</Button>
                  <Button size="sm" variant="danger" disabled={busy === p.id} onClick={() => setRejecting(p)}>Reject</Button>
                </div>
              );
            },
          },
        ]}
      />
      {list.hasMore ? <Button className="mt-3" disabled={list.loading} onClick={() => void list.more()}>Load more</Button> : null}
      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject payout"
        description={rejecting ? `${money(rejecting.amountPaise)} to ${rejecting.ownerId} goes back to the wallet.` : undefined}
        footer={<><Button onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" disabled={!reason.trim() || busy !== null} onClick={() => void reject()}>Reject</Button></>}
      >
        <FormField label="Reason" required>
          {({ inputId }) => <TextArea id={inputId} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
      </Dialog>
    </Card>
  );
}

function RequestPayout({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [ownerType, setOwnerType] = useState<OwnerType>("dealer");
  const [ownerId, setOwnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per filled-in request, so a retry after a dropped answer cannot pay twice.
  const [key, setKey] = useState(idempotencyKey);
  const paise = toPaise(amount);

  async function submit() {
    if (!ownerId.trim() || !paise || !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const out = await financeApi.requestPayout(key, { ownerType, ownerId: ownerId.trim(), amountPaise: paise, note: note.trim() });
      toast(out.replayed ? "This payout was already requested." : `Payout of ${money(paise)} requested. It waits for approval.`);
      setKey(idempotencyKey());
      setAmount("");
      setNote("");
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-[560px]">
      <CardHeader title="Request a payout" description="The amount leaves the wallet's spendable balance now. You cannot approve your own request." />
      <div className="flex flex-col gap-4">
        <OwnerFields ownerType={ownerType} ownerId={ownerId} onType={(t) => { setOwnerType(t); setKey(idempotencyKey()); }} onId={(v) => { setOwnerId(v); setKey(idempotencyKey()); }} />
        <FormField label="Amount (₹)" required error={amount && !paise ? "Enter an amount like 1500 or 1500.50" : undefined}>
          {({ inputId }) => <TextInput id={inputId} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setKey(idempotencyKey()); }} />}
        </FormField>
        <FormField label="Note" required>
          {({ inputId }) => <TextArea id={inputId} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setKey(idempotencyKey()); }} />}
        </FormField>
        {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
        <Button variant="gold" disabled={busy || !ownerId.trim() || !paise || !note.trim()} onClick={() => void submit()}>
          {busy ? "Requesting…" : "Request payout"}
        </Button>
      </div>
    </Card>
  );
}

function OwnerFields({ ownerType, ownerId, onType, onId }: { ownerType: OwnerType; ownerId: string; onType: (t: OwnerType) => void; onId: (v: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Owner type" required>
        {({ inputId }) => (
          <SelectInput id={inputId} value={ownerType} onChange={(e) => onType(e.target.value as OwnerType)}>
            <option value="dealer">Dealer</option>
            <option value="sub_dealer">Sub-Dealer</option>
          </SelectInput>
        )}
      </FormField>
      <FormField label={ownerType === "dealer" ? "Dealer ID" : "Sub-Dealer ID"} required helper={ownerType === "dealer" ? "Like DLR-1024" : "Like SDL-2048"}>
        {({ inputId }) => <TextInput id={inputId} value={ownerId} onChange={(e) => onId(e.target.value.toUpperCase())} />}
      </FormField>
    </div>
  );
}

function PayoutAccounts() {
  const can = useCan();
  const toast = useToast();
  const [ownerType, setOwnerType] = useState<OwnerType>("dealer");
  const [ownerId, setOwnerId] = useState("");
  const [found, setFound] = useState<PayoutAccount | null | "none">(null);
  const [holderName, setHolder] = useState("");
  const [accountNumber, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(idempotencyKey);
  const validAccount = /^[0-9]{9,18}$/.test(accountNumber);
  const validIfsc = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);

  async function look() {
    setError(null);
    try {
      setFound(await financeApi.payoutAccount(ownerType, ownerId.trim()));
    } catch (e) {
      if (errorCodeOf(e) === "PAYOUT_ACCOUNT_NOT_FOUND") setFound("none");
      else setError(errorText(e));
    }
  }
  async function register() {
    setBusy(true);
    setError(null);
    try {
      const account = await financeApi.registerAccount(key, { ownerType, ownerId: ownerId.trim(), holderName: holderName.trim(), accountNumber, ifsc });
      setFound(account);
      setAccount("");
      setKey(idempotencyKey());
      toast("Bank account registered. Only its last four digits are kept.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-[640px]">
      <CardHeader title="Payout accounts" description="The bank account a Dealer or Sub-Dealer is paid to. The account number is sent to the payout vendor once and never stored." />
      <div className="flex flex-col gap-4">
        <OwnerFields ownerType={ownerType} ownerId={ownerId} onType={(t) => { setOwnerType(t); setFound(null); }} onId={(v) => { setOwnerId(v); setFound(null); }} />
        <Button disabled={!ownerId.trim()} onClick={() => void look()}>Look up account</Button>
        {found && found !== "none" ? (
          <div className="fx-card fx-card-pad text-[14px]">
            <div className="font-medium">{found.holderName}</div>
            <div className="fx-muted">IFSC {found.ifsc} · account ending {found.last4}</div>
          </div>
        ) : null}
        {found === "none" ? <p className="text-[14px] fx-muted">No payout account yet.</p> : null}
        {can("finance.payout-account.manage") && found !== null ? (
          <>
            <h3 className="fx-card-title">{found === "none" ? "Register account" : "Replace account"}</h3>
            <FormField label="Account holder" required>
              {({ inputId }) => <TextInput id={inputId} value={holderName} maxLength={200} onChange={(e) => { setHolder(e.target.value); setKey(idempotencyKey()); }} />}
            </FormField>
            <FormField label="Account number" required error={accountNumber && !validAccount ? "9 to 18 digits" : undefined}>
              {({ inputId }) => <TextInput id={inputId} inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(e) => { setAccount(e.target.value.replace(/\D/g, "")); setKey(idempotencyKey()); }} />}
            </FormField>
            <FormField label="IFSC" required error={ifsc && !validIfsc ? "Like SBIN0001234" : undefined}>
              {({ inputId }) => <TextInput id={inputId} value={ifsc} maxLength={11} onChange={(e) => { setIfsc(e.target.value.toUpperCase()); setKey(idempotencyKey()); }} />}
            </FormField>
            <Button variant="primary" disabled={busy || !holderName.trim() || !validAccount || !validIfsc} onClick={() => void register()}>
              {busy ? "Registering…" : "Register account"}
            </Button>
          </>
        ) : null}
        {error ? <p className="fx-field-error" role="alert">{error}</p> : null}
      </div>
    </Card>
  );
}
