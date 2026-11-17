"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, FormField, SelectInput, TextInput, useToast } from "@/components/admin-ui";
import { AuthApiError } from "@/features/auth/services/auth-client";
import { api } from "@/lib/api";
import type { RecordRow } from "../../data/records";
import { warehouseNames } from "../../services/lookups";
import { districtChoices } from "../../services/partners.service";

/*
 * A user's roles, territories, warehouses and price tier (PUT /access/users/:id/{roles,territories,warehouses,price-tier}).
 * The API has no read for another user's assignments, so each list is set whole: what is ticked here replaces what they had.
 */

type Option = { id: string; label: string };
type Kind = "roles" | "territories" | "warehouses";

const SETS: Record<Kind, { title: string; path: string; field: string; helper: string }> = {
  roles: { title: "Roles", path: "roles", field: "roleIds", helper: "Up to 20. You can't grant permissions you don't hold." },
  territories: { title: "Territories", path: "territories", field: "territoryIds", helper: "Districts they cover. Only districts inside your own." },
  warehouses: { title: "Warehouses", path: "warehouses", field: "warehouseIds", helper: "Where they see and change stock." },
};

const PRICE_TIERS = { "Customer (selling price)": "selling", Prime: "prime", "Sub-dealer": "subDealer", Dealer: "dealer" } as const;

const messageOf = (error: unknown) =>
  error instanceof AuthApiError && error.message ? `${error.message.replace(/\.$/, "")}. Nothing was changed.` : "Couldn't save. Nothing was changed.";

async function optionsOf(kind: Kind): Promise<Option[]> {
  if (kind === "roles") return (await api.get<{ roles: { id: string; name: string }[] }>("/access/roles")).roles.map((r) => ({ id: r.id, label: r.name }));
  if (kind === "territories") return [...(await districtChoices())].map(([label, id]) => ({ id, label }));
  return [...(await warehouseNames())].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}

function AssignSet({ kind, userId, name }: { kind: Kind; userId: string; name: string }) {
  const toast = useToast();
  const spec = SETS[kind];
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || options) return;
    let live = true;
    optionsOf(kind)
      .then((list) => live && setOptions(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, options, kind]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (options ?? []).filter((o) => !needle || o.label.toLowerCase().includes(needle));
  }, [options, filter]);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/access/users/${userId}/${spec.path}`, { [spec.field]: picked });
      toast(picked.length ? `${name}: ${spec.title.toLowerCase()} set (${picked.length}).` : `${name} now has no ${spec.title.toLowerCase()}.`);
      setOpen(false);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Set {spec.title.toLowerCase()}
      </Button>
    );
  }

  return (
    <div className="grid w-full gap-3 rounded-[14px] border border-[var(--fx-border)] p-3">
      <div>
        <p className="text-[14px] font-semibold">{spec.title}</p>
        <p className="text-[12px] fx-muted">{spec.helper} Saving replaces their current {spec.title.toLowerCase()}.</p>
      </div>
      {failed ? <p className="text-[13px] fx-muted">Couldn&rsquo;t load the choices.</p> : null}
      {!options && !failed ? <p className="text-[13px] fx-muted">Loading…</p> : null}
      {options ? (
        <>
          {options.length > 8 ? <TextInput aria-label={`Filter ${spec.title.toLowerCase()}`} placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} /> : null}
          <div className="grid max-h-[220px] gap-2 overflow-y-auto">
            {shown.map((option) => (
              <Checkbox
                key={option.id}
                checked={picked.includes(option.id)}
                onChange={(on) => setPicked((list) => (on ? [...list, option.id] : list.filter((id) => id !== option.id)))}
              >
                {option.label}
              </Checkbox>
            ))}
            {!shown.length ? <p className="text-[13px] fx-muted">Nothing to choose.</p> : null}
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={busy || !options} onClick={() => void save()}>
          {busy ? "Saving…" : `Save ${spec.title.toLowerCase()}`}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PriceTier({ userId, name }: { userId: string; name: string }) {
  const toast = useToast();
  const [tier, setTier] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const priceTier = PRICE_TIERS[tier as keyof typeof PRICE_TIERS];
    if (!priceTier) return;
    setBusy(true);
    try {
      await api.put(`/access/users/${userId}/price-tier`, { priceTier });
      toast(`${name} now buys at the ${tier} price list.`);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormField label="Price list" helper="The prices they buy at. Nobody can set their own.">
      {({ inputId, describedBy }) => (
        <div className="flex flex-wrap gap-2">
          <SelectInput id={inputId} aria-describedby={describedBy} value={tier} onChange={(e) => setTier(e.target.value)} disabled={busy} className="max-w-[260px]">
            <option value="" disabled>
              Choose…
            </option>
            {Object.keys(PRICE_TIERS).map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </SelectInput>
          <Button variant="secondary" size="sm" disabled={busy || !tier} onClick={() => void save()}>
            Set price list
          </Button>
        </div>
      )}
    </FormField>
  );
}

export function UserAccess({ row }: { row: RecordRow; onChanged: () => void }) {
  const name = String(row.name ?? "This user");
  if (row.role === "Super Admin") return <p className="text-[13px] fx-muted">A Super Admin has every permission and territory; nothing to assign.</p>;
  return (
    <section aria-label="Access" className="grid gap-4">
      <div>
        <h3 className="text-[15px] font-semibold">Access</h3>
        <p className="text-[12px] fx-muted">Their current assignments can&rsquo;t be read back yet, so tick everything they should have.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(SETS) as Kind[]).map((kind) => (
          <AssignSet key={kind} kind={kind} userId={row.id} name={name} />
        ))}
      </div>
      <PriceTier userId={row.id} name={name} />
    </section>
  );
}
