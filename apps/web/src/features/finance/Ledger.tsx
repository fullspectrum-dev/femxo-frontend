"use client";

import { useState } from "react";
import { Badge, Button, Card, Drawer, ErrorState, PageHeader, SelectInput, StatCard, TextInput } from "@/components/admin-ui";
import { financeApi } from "./finance.api";
import type { OwnerType, Wallet } from "./finance.api";
import { dateTime, errorText, money, SimpleTable, useAsync, usePaged } from "./kit";

/** Wallets inside the user's territories, and the ledger of one: every movement, per bucket, with the balance after it. */
export function LedgerScreen() {
  const [ownerType, setOwnerType] = useState<OwnerType | "">("");
  const [ownerId, setOwnerId] = useState("");
  const [filter, setFilter] = useState({ ownerType: "" as OwnerType | "", ownerId: "" });
  const list = usePaged((cursor) => financeApi.wallets({ ownerType: filter.ownerType || undefined, ownerId: filter.ownerId || undefined, cursor }), [filter.ownerType, filter.ownerId]);
  const [open, setOpen] = useState<Wallet | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Wallets & ledger" description="Balances are the sum of the ledger. Money only moves through ledger rows; a correction is a later reversal row." />
      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ ownerType, ownerId: ownerId.trim() });
          }}
        >
          <SelectInput aria-label="Owner type" value={ownerType} onChange={(e) => setOwnerType(e.target.value as OwnerType | "")} className="w-auto">
            <option value="">All owners</option>
            <option value="dealer">Dealers</option>
            <option value="sub_dealer">Sub-Dealers</option>
          </SelectInput>
          <TextInput aria-label="Owner ID" placeholder="DLR-… or SDL-…" value={ownerId} onChange={(e) => setOwnerId(e.target.value.toUpperCase())} className="w-auto" />
          <Button type="submit">Filter</Button>
        </form>
        {list.error ? <ErrorState message={errorText(list.error)} action={<Button onClick={list.reload}>Retry</Button>} /> : null}
        <SimpleTable
          rows={list.items}
          rowKey={(w) => w.id}
          onRow={setOpen}
          empty={list.loading ? "Loading…" : "No wallets."}
          cols={[
            { header: "Owner", cell: (w) => <span className="font-medium">{w.ownerId}</span> },
            { header: "Type", cell: (w) => (w.ownerType === "dealer" ? "Dealer" : "Sub-Dealer") },
            { header: "", align: "right", cell: () => <span className="fx-muted">Ledger ›</span> },
          ]}
        />
        {list.hasMore ? <Button className="mt-3" disabled={list.loading} onClick={() => void list.more()}>Load more</Button> : null}
      </Card>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open?.ownerId ?? ""} subtitle={open ? `${open.ownerType === "dealer" ? "Dealer" : "Sub-Dealer"} wallet` : undefined}>
        {open ? <WalletLedger wallet={open} /> : null}
      </Drawer>
    </div>
  );
}

function WalletLedger({ wallet }: { wallet: Wallet }) {
  const detail = useAsync(() => financeApi.wallet(wallet.id), [wallet.id]);
  const rows = usePaged((cursor) => financeApi.ledger(wallet.id, cursor), [wallet.id]);
  const b = detail.data?.balances;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Spendable" value={money(b?.spendable)} />
        <StatCard label="Held" value={money(b?.held)} />
        <StatCard label="Pending" value={money(b?.pending)} />
      </div>
      {rows.error ? <ErrorState message={errorText(rows.error)} /> : null}
      <SimpleTable
        rows={rows.items}
        rowKey={(r) => r.id}
        empty={rows.loading ? "Loading…" : "No movements yet."}
        cols={[
          { header: "When", cell: (r) => <><div>{dateTime(r.at)}</div><div className="text-[12px] fx-muted">{r.reference ?? r.reason ?? ""}</div></> },
          { header: "Type", cell: (r) => <><div>{r.type.replace(/_/g, " ")}</div><Badge plain tone="neutral">{r.bucket}</Badge>{r.reversesMovementId ? <div className="text-[12px] fx-muted">reversal</div> : null}</> },
          { header: "Amount", align: "right", cell: (r) => <span className={r.amount < 0 ? "text-[color:var(--fx-error,#b42318)]" : ""}>{money(r.amount)}</span> },
          { header: "Balance", align: "right", cell: (r) => money(r.balanceAfter) },
        ]}
      />
      {rows.hasMore ? <Button disabled={rows.loading} onClick={() => void rows.more()}>Load older</Button> : null}
    </div>
  );
}
