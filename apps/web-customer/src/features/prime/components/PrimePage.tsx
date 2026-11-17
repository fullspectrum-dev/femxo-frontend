"use client";

import { Check, Crown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR, idempotencyKey, verdictOfPayment } from "@femxo/shared";
import { isApiError, userMessage } from "@femxo/shared/api";
import type { AuthApi, OrdersApi, PrimeApi } from "@femxo/shared/api";
import type { PrimeMembership, PrimePlan, PrimePurchase } from "@femxo/shared/contracts";
import { Badge, Button, buttonClasses, EmptyState, ErrorState, Skeleton, useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { PaymentProgress } from "@/features/payments/components/PaymentProgress";
import { outcomeMessage } from "@/features/payments/outcome-copy";
import { useOnlinePayment } from "@/features/payments/useOnlinePayment";
import type { PayResult } from "@/features/payments/useOnlinePayment";
import { getAuthApi, getOrdersApi, getPrimeApi } from "@/lib/api";
import { MembershipCard } from "./MembershipCard";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function PlanCard({ plan, verb, highlight, busy, onChoose }: { plan: PrimePlan; verb: string; highlight: boolean; busy: boolean; onChoose: () => void }) {
  const months = Math.max(1, Math.round(plan.durationDays / 30));
  return (
    <li data-testid="prime-plan" className={highlight ? "relative flex flex-col gap-3 rounded-card border-2 border-primary bg-surface p-5" : "flex flex-col gap-3 rounded-card border border-line bg-surface p-5"}>
      {highlight ? (
        <Badge tone="gold" className="absolute -top-3 left-5">
          Best value
        </Badge>
      ) : null}
      <h3 className="font-display text-xl font-bold">{plan.name}</h3>
      <p>
        <span className="text-3xl font-bold">{formatINR(plan.pricePaise)}</span>
        <span className="text-sm text-ink-muted"> for {plan.durationDays} days</span>
      </p>
      {months > 1 ? <p className="text-sm text-success">Just {formatINR(Math.round(plan.pricePaise / months))} a month</p> : null}
      <ul className="grid flex-1 gap-1.5 text-sm">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2">
            <Check size={16} className="mt-0.5 flex-none text-success" aria-hidden="true" />
            {benefit}
          </li>
        ))}
      </ul>
      <Button variant={highlight ? "gold" : "primary"} busy={busy} aria-label={`${verb} ${plan.name}`} onClick={onChoose}>
        {verb}
      </Button>
    </li>
  );
}

/**
 * Prime: the plans for everyone, and for a member their card. Joining pays with Razorpay Checkout, like an order: the server makes
 * the payment for the plan's own price, and Prime starts when the server has the money, never on the browser's say-so.
 */
export function PrimePage({ prime, auth, orders }: { prime?: PrimeApi; auth?: AuthApi; orders?: OrdersApi }) {
  const router = useRouter();
  const toast = useToast();
  const { status, user, setUser } = useSession();
  const primeRef = useRef(prime);
  const authRef = useRef(auth);
  const ordersRef = useRef(orders);
  const primeApi = useCallback(() => (primeRef.current ??= getPrimeApi()), []);
  const { phase, pay } = useOnlinePayment();

  const [plans, setPlans] = useState<PrimePlan[] | null>(null);
  const [state, setState] = useState<PrimeMembership | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [result, setResult] = useState<PayResult | { kind: "error"; message: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  /** One key per plan being bought: a retry of the same purchase gets the same payment back, a different plan a new one. */
  const attempt = useRef<{ planId: string; key: string } | null>(null);

  const signedIn = status === "signed-in";
  const userId = user?.id ?? null;

  const loadPlans = useCallback(() => {
    setFailed(false);
    primeApi()
      .plans()
      .then(setPlans)
      .catch(() => setFailed(true));
  }, [primeApi]);

  useEffect(() => {
    // loadPlans() only sets state once the request has answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (!signedIn || !userId) return;
    let cancelled = false;
    primeApi()
      .membership()
      .then((m) => !cancelled && setState(m))
      .catch(() => undefined); // the plans are still worth showing
    return () => {
      cancelled = true;
    };
  }, [signedIn, userId, primeApi]);

  // Money was taken but not yet confirmed: keep reading the membership until Prime starts (or we give up and say it will).
  useEffect(() => {
    if (!waiting) return;
    const before = state?.subscription?.endAt;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const m = await primeApi().membership();
        if (m.isPrime && m.subscription?.endAt !== before) {
          setState(m);
          setWaiting(false);
          setUser(await (authRef.current ??= getAuthApi()).me());
          toast("Welcome to Prime! Your member prices are on.");
        }
      } catch {
        // try again
      }
      if (tries >= 40) setWaiting(false);
    }, 3000);
    return () => clearInterval(timer);
    // `state` is read once, when waiting starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  async function choose(plan: PrimePlan) {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/prime")}`);
      return;
    }
    setBusyPlan(plan.id);
    setResult(null);
    if (attempt.current?.planId !== plan.id) attempt.current = { planId: plan.id, key: idempotencyKey() };
    let purchase: PrimePurchase;
    try {
      purchase = await primeApi().purchase(plan.id, attempt.current.key);
    } catch (error) {
      if (isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429) attempt.current = null;
      setBusyPlan(null);
      setResult({ kind: "error", message: userMessage(error, "We couldn't start that. Please try again.") });
      return;
    }
    const orders = (ordersRef.current ??= getOrdersApi());
    const outcome = await pay({
      keyId: purchase.payment.keyId,
      providerOrderId: purchase.payment.providerOrderId,
      amountPaise: purchase.payment.amountPaise,
      description: `Femxo Prime: ${purchase.plan.name}`,
      prefill: user ? { name: user.name || undefined, contact: `+91${user.phone}`, email: user.email ?? undefined } : undefined,
      verify: (success) => orders.verifyPayment(success),
      // The payment's id is known from the start, so asking after it works even if the browser's callback never reached us.
      check: async () => verdictOfPayment(await orders.payment(purchase.payment.id)),
    });
    setBusyPlan(null);
    if (outcome.kind === "paid") {
      attempt.current = null;
      try {
        setState(await primeApi().membership());
        setUser(await (authRef.current ??= getAuthApi()).me());
      } catch {
        // The membership is paid for either way; a reload will show it.
      }
      toast("Welcome to Prime! Your member prices are on.");
      return;
    }
    if (outcome.kind === "unconfirmed") setWaiting(true);
    if (outcome.kind === "failed") attempt.current = null;
    setResult(outcome);
  }

  if (failed && !plans) return <ErrorState title="We couldn't load Prime" message="Check your connection and try again." onRetry={loadPlans} />;
  if (plans && plans.length === 0)
    return (
      <EmptyState
        title="No Prime plans right now"
        message="There are no plans on sale at the moment. Please check back soon."
        action={
          <Link href="/" className={buttonClasses()}>
            Keep shopping
          </Link>
        }
      />
    );

  const active = state?.isPrime === true;
  const verb = active ? "Extend with" : "Join";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 grid gap-2 text-center">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold">
          <Crown size={16} className="text-gold-deep" aria-hidden="true" />
          Femxo Prime
        </p>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Pay less, every day</h1>
        <p className="mx-auto max-w-xl text-ink-muted">Member prices on the Femxo store.</p>
      </div>

      <div className="mb-4 grid gap-3" aria-live="polite">
        <PaymentProgress phase={phase} />
        {waiting ? (
          <p role="status" data-testid="prime-confirming" className="rounded-control bg-info-soft px-4 py-3 text-sm font-medium text-info">
            We&apos;re waiting for your bank to confirm the payment. Prime starts as soon as it does, and this page updates by itself. You don&apos;t need to pay again.
          </p>
        ) : null}
        {result && result.kind !== "paid" ? (
          <p role="alert" data-testid="prime-outcome" className="rounded-control bg-warning-soft px-4 py-3 text-sm font-medium text-ink">
            {outcomeMessage(result)}
          </p>
        ) : null}
      </div>

      {active && state?.subscription ? (
        <div className="mb-8 grid gap-2">
          <MembershipCard subscription={state.subscription} name={user?.name ?? ""} />
          <p className="text-sm text-ink-muted">Your Prime runs until {DATE.format(new Date(state.subscription.endAt))}. Extending adds the new plan on top of the days you have left.</p>
        </div>
      ) : null}

      <h2 className="mb-4 font-display text-2xl font-bold">{active ? "Extend your Prime" : "Choose a plan"}</h2>
      {!plans ? (
        <div role="status" className="grid gap-4 md:grid-cols-3">
          <span className="sr-only">Loading plans…</span>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-6 pt-3 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              verb={verb}
              highlight={plans.length > 1 && plan.durationDays === Math.max(...plans.map((p) => p.durationDays))}
              busy={busyPlan === plan.id}
              onChoose={() => void choose(plan)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
