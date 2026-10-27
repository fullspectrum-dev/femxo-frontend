"use client";

import { Check, Crown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@femxo/shared";
import { isApiError } from "@femxo/shared/api";
import type { AuthApi, PrimeApi } from "@femxo/shared/api";
import type { MembershipStatus, PaymentIntent, PrimePlan } from "@femxo/shared/contracts";
import { Badge, Button, ErrorState, Skeleton, useToast } from "@femxo/ui";
import { useSession } from "@/features/auth/components/SessionProvider";
import { PaymentSheet } from "@/features/payments/components/PaymentSheet";
import { getAuthApi, getPrimeApi } from "@/lib/api";
import { MembershipCard } from "./MembershipCard";
import { PrimeCoupons, ReferralCard } from "./PrimePerks";

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

interface Pending {
  orderId: string;
  intent: PaymentIntent;
  amount: number;
}

function PlanCard({ plan, verb, highlight, busy, onChoose }: { plan: PrimePlan; verb: string; highlight: boolean; busy: boolean; onChoose: () => void }) {
  const months = Math.max(1, Math.round(plan.durationDays / 30));
  return (
    <li className={highlight ? "relative flex flex-col gap-3 rounded-card border-2 border-primary bg-surface p-5 shadow-raised" : "flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card"}>
      {highlight ? <Badge tone="gold" className="absolute -top-3 left-5">Best value</Badge> : null}
      <h3 className="font-display text-xl font-bold">{plan.name}</h3>
      <p>
        <span className="text-3xl font-bold">{formatINR(plan.price)}</span>
        <span className="text-sm text-ink-muted"> for {plan.durationDays} days</span>
      </p>
      {months > 1 ? <p className="text-sm text-success">Just {formatINR(Math.round(plan.price / months))} a month</p> : null}
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
 * Prime: the plans for everyone, and for a member their card, coupons and
 * referral link. Joining goes through the same payment flow as an order.
 */
export function PrimePage({ prime, auth }: { prime?: PrimeApi; auth?: AuthApi }) {
  const router = useRouter();
  const toast = useToast();
  const { status, user, setUser } = useSession();
  const primeRef = useRef(prime);
  const authRef = useRef(auth);
  const primeApi = useCallback(() => (primeRef.current ??= getPrimeApi()), []);

  const [plans, setPlans] = useState<PrimePlan[] | null>(null);
  const [state, setState] = useState<MembershipStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [unpaid, setUnpaid] = useState<string | null>(null);

  const signedIn = status === "signed-in";
  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    primeApi()
      .plans()
      .then((list) => !cancelled && setPlans(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [primeApi]);

  const loadMembership = useCallback(async () => {
    setState(await primeApi().membership());
  }, [primeApi]);

  useEffect(() => {
    if (!signedIn || !userId) return;
    let cancelled = false;
    primeApi()
      .membership()
      .then((result) => !cancelled && setState(result))
      .catch(() => undefined); // the plans are still worth showing
    return () => {
      cancelled = true;
    };
  }, [signedIn, userId, primeApi]);

  async function choose(plan: PrimePlan) {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/prime")}`);
      return;
    }
    setBusyPlan(plan.id);
    setUnpaid(null);
    try {
      const { order, intent } = await primeApi().purchase(plan.id);
      setPending({ orderId: order.id, intent, amount: order.total });
    } catch (error) {
      toast(isApiError(error) ? error.message : "We couldn't start that. Please try again.", { tone: "error" });
    } finally {
      setBusyPlan(null);
    }
  }

  async function paid() {
    setPending(null);
    try {
      await loadMembership();
      // Prices across the site follow the customer's tier.
      setUser(await (authRef.current ??= getAuthApi()).me());
    } catch {
      // The membership is paid for either way; a reload will show it.
    }
    toast("Welcome to Prime! Prime prices and free delivery are on.");
  }

  if (failed && !plans) return <ErrorState title="We couldn't load Prime" message="Check your connection and try again." onRetry={() => window.location.reload()} />;

  const active = state?.active === true;
  const lapsed = !active && state?.membership != null;
  const verb = active ? "Extend with" : lapsed ? "Renew" : "Join";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 grid gap-2 text-center">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold">
          <Crown size={16} className="text-gold-deep" aria-hidden="true" />
          Femxo Prime
        </p>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Pay less, every day</h1>
        <p className="mx-auto max-w-xl text-ink-muted">Prime prices on everything, free delivery on every order, and member-only coupons.</p>
      </div>

      {unpaid ? (
        <p role="status" className="mb-4 rounded-control bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          Your Prime payment is waiting.{" "}
          <Link href={`/orders/${unpaid}`} className="font-semibold underline">
            Finish it from your orders
          </Link>
          .
        </p>
      ) : null}

      {lapsed && state?.membership ? (
        <p role="status" className="mb-4 rounded-control bg-info-soft px-4 py-3 text-sm font-medium text-info">
          Your Prime ended on {DATE.format(new Date(state.membership.validTill))}. Renew to get Prime prices and free delivery again.
        </p>
      ) : null}

      {active && state?.membership ? (
        <div className="mb-8 grid gap-5">
          <MembershipCard membership={state.membership} name={user?.name ?? ""} />
          <div className="grid items-start gap-5 md:grid-cols-2">
            <PrimeCoupons prime={prime} />
            <ReferralCard prime={prime} />
          </div>
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
            <PlanCard key={plan.id} plan={plan} verb={verb} highlight={plan.id === "pln-annual"} busy={busyPlan === plan.id} onChoose={() => void choose(plan)} />
          ))}
        </ul>
      )}

      {pending ? (
        <PaymentSheet
          open
          orderId={pending.orderId}
          intent={pending.intent}
          amount={pending.amount}
          onPaid={() => void paid()}
          onClose={() => {
            setUnpaid(pending.orderId);
            setPending(null);
          }}
        />
      ) : null}
    </section>
  );
}
