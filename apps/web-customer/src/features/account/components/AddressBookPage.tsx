"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { userMessage } from "@femxo/shared/api";
import type { AddressApi } from "@femxo/shared/api";
import type { Address, AddressBook as Book, AddressInput } from "@femxo/shared/contracts";
import { Badge, Button, Dialog, ErrorState, Skeleton, useToast } from "@femxo/ui";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { getAddressApi } from "@/lib/api";

/** One address as a few readable lines (shared with checkout). */
export function AddressLines({ address }: { address: Pick<Address, "name" | "phone" | "line1" | "line2" | "landmark" | "pincode"> }) {
  return (
    <div className="grid gap-0.5 text-sm">
      <p className="font-semibold">{address.name}</p>
      <p>
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
      </p>
      {address.landmark ? <p className="text-ink-muted">Near {address.landmark}</p> : null}
      <p className="text-ink-muted">
        Pincode {address.pincode} · +91 {address.phone}
      </p>
    </div>
  );
}

function AddressBookView({ api }: { api?: AddressApi }) {
  const apiRef = useRef(api);
  const client = () => (apiRef.current ??= getAddressApi());
  const toast = useToast();
  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  async function load() {
    setFailed(false);
    try {
      setBook(await client().list());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    // load() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(input: AddressInput, id: string | null, key: string) {
    if (id) await client().update(id, input);
    else await client().create(input, key);
    // A new default (or the first address) moves the others, so the whole book is read again.
    setBook(await client().list());
    setEditing(null);
    toast(id ? "Address updated" : "Address added");
  }

  async function makeDefault(entry: Address) {
    try {
      await client().setDefault(entry.id);
      setBook(await client().list());
      toast("Default address changed");
    } catch (error) {
      toast(userMessage(error, "We couldn't change that. Please try again."), { tone: "error" });
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await client().remove(deleting.id);
      setBook(await client().list());
      toast("Address deleted");
    } catch (error) {
      toast(userMessage(error, "We couldn't delete that. Please try again."), { tone: "error" });
    }
    setDeleting(null);
  }

  if (failed) return <ErrorState title="We couldn't load your addresses" message="Check your connection and try again." onRetry={() => void load()} />;
  if (!book) {
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading your addresses…</span>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  const full = book.max !== undefined && book.items.length >= book.max;

  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {book.items.map((entry) =>
          editing === entry.id ? (
            <li key={entry.id} className="rounded-card border border-primary bg-surface p-4">
              <AddressForm initial={entry} onSave={(input, key) => save(input, entry.id, key)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={entry.id} data-testid="address" className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface p-4">
              <div className="grid gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  {entry.label ? <Badge tone="neutral">{entry.label}</Badge> : null}
                  {entry.isDefault ? <Badge tone="primary">Default</Badge> : null}
                </p>
                <AddressLines address={entry} />
                {!entry.isDefault ? (
                  <button type="button" onClick={() => void makeDefault(entry)} aria-label={`Make default: ${entry.name}, ${entry.line1}`} className="mt-1 w-max text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                    Make default
                  </button>
                ) : null}
              </div>
              <div className="flex flex-none gap-1">
                <Button variant="ghost" size="sm" aria-label={`Edit address: ${entry.name}, ${entry.line1}`} onClick={() => setEditing(entry.id)}>
                  <Pencil size={16} aria-hidden="true" />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Delete address: ${entry.name}, ${entry.line1}`} onClick={() => setDeleting(entry)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          )
        )}
      </ul>

      {book.items.length === 0 && editing !== "new" ? <p className="text-sm text-ink-muted">You haven&apos;t saved an address yet.</p> : null}

      {editing === "new" ? (
        <div className="rounded-card border border-primary bg-surface p-4">
          <AddressForm onSave={(input, key) => save(input, null, key)} onCancel={() => setEditing(null)} />
        </div>
      ) : full ? (
        <p className="text-sm text-ink-muted">Your address book is full ({book.max}). Delete one to add another.</p>
      ) : (
        <Button variant="secondary" className="w-max" onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" />
          Add a new address
        </Button>
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        description={deleting ? `${deleting.line1}, ${deleting.pincode}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete address
            </Button>
          </>
        }
      >
        <p className="text-sm">Orders you&apos;ve already placed aren&apos;t affected.</p>
      </Dialog>
    </div>
  );
}

/** The address book: add, edit, delete, and choose the default. */
export function AddressBookPage({ api }: { api?: AddressApi }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6">
      <p className="mb-2 text-sm">
        <Link href="/account" className="font-semibold text-primary hover:underline">
          ← Account
        </Link>
      </p>
      <h1 className="mb-4 font-display text-2xl font-bold">Your addresses</h1>
      <RequireCustomer>
        <AddressBookView api={api} />
      </RequireCustomer>
    </section>
  );
}
