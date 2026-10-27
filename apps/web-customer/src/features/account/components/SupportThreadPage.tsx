"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isApiError } from "@femxo/shared/api";
import type { SupportApi } from "@femxo/shared/api";
import type { Ticket } from "@femxo/shared/contracts";
import { Badge, Button, ErrorState, Skeleton } from "@femxo/ui";
import { RequireCustomer } from "@/features/auth/components/Guards";
import { getSupportApi } from "@/lib/api";
import { TextArea } from "./Fields";
import { TICKET_STATUS } from "./SupportPage";

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Thread({ id, support }: { id: string; support?: SupportApi }) {
  const apiRef = useRef(support);
  const client = () => (apiRef.current ??= getSupportApi());
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTicket(await client().get(id));
      setState("ready");
    } catch (e) {
      setState(isApiError(e, "NOT_FOUND") ? "missing" : "error");
    }
  }

  useEffect(() => {
    // load() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (reply.trim().length < 2) return setError("Write a message first.");
    setBusy(true);
    setError(undefined);
    try {
      setTicket(await client().reply(id, reply.trim()));
      setReply("");
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn't send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading your request…</span>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (state === "missing") return <ErrorState title="We couldn't find that request" message="It may belong to another account." />;
  if (state === "error" || !ticket) {
    return (
      <ErrorState
        title="We couldn't load this request"
        message="Check your connection and try again."
        onRetry={() => {
          setState("loading");
          void load();
        }}
      />
    );
  }

  const status = TICKET_STATUS[ticket.status];
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
          {ticket.subject}
          <Badge tone={status.tone}>{status.label}</Badge>
        </h2>
        {ticket.orderId ? (
          <p className="text-sm">
            About{" "}
            <Link href={`/orders/${ticket.orderId}`} className="font-semibold text-primary hover:underline">
              your order
            </Link>
          </p>
        ) : null}
      </div>

      <ol aria-label="Conversation" className="grid gap-3">
        {ticket.messages.map((message) => (
          <li key={message.id} className={message.from === "customer" ? "justify-self-end" : "justify-self-start"}>
            <div className={message.from === "customer" ? "max-w-prose rounded-card bg-primary-soft p-3 text-sm" : "max-w-prose rounded-card border border-line bg-surface p-3 text-sm shadow-card"}>
              <p className="mb-1 text-xs font-semibold text-ink-muted">
                {message.from === "customer" ? "You" : "Femxo support"} · <time dateTime={message.at}>{WHEN.format(new Date(message.at))}</time>
              </p>
              <p className="whitespace-pre-wrap">{message.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <form onSubmit={send} noValidate aria-label="Reply" className="grid gap-3">
        <TextArea label="Your reply" value={reply} error={error} maxLength={2000} onChange={(e) => setReply(e.target.value)} />
        <Button type="submit" busy={busy} className="w-max">
          Send reply
        </Button>
      </form>
    </div>
  );
}

/** One request: the conversation so far, and a box to reply. */
export function SupportThreadPage({ ticketId, support }: { ticketId?: string; support?: SupportApi }) {
  const params = useParams<{ id: string }>();
  const id = ticketId ?? params.id;
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6">
      <p className="mb-2 text-sm">
        <Link href="/account/support" className="font-semibold text-primary hover:underline">
          ← All requests
        </Link>
      </p>
      <h1 className="sr-only">Support request</h1>
      <RequireCustomer>
        <Thread id={id} support={support} />
      </RequireCustomer>
    </section>
  );
}
