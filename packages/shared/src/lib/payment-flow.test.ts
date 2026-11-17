import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import type { Payment, VerifyResult } from "../contracts/commerce";
import { failureText, paymentVerdict, runCheckout, settlePayment, verdictOfOrderStatus } from "./payment-flow";
import type { RazorpayInstance, RazorpayOptions } from "./payment-flow";

const payment = (status: Payment["status"]): Payment => ({ id: "pay1", purpose: "order", amountPaise: 5000, status, providerOrderId: "order_X" });
const verified = (status: Payment["status"], confirmed = true): VerifyResult => ({ payment: payment(status), confirmed });

/** A clock the tests move by hand: every sleep advances it. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: vi.fn(async (ms: number) => void (t += ms)) };
}

describe("paymentVerdict", () => {
  it("only captured (and later refunded) money is paid", () => {
    expect(paymentVerdict("captured")).toBe("paid");
    expect(paymentVerdict("partially_refunded")).toBe("paid");
    expect(paymentVerdict("refunded")).toBe("paid");
    expect(paymentVerdict("failed")).toBe("failed");
    expect(paymentVerdict("expired")).toBe("failed");
    expect(paymentVerdict("created")).toBe("pending");
    expect(paymentVerdict("authorized")).toBe("pending");
  });

  it("reads an order's status the same way", () => {
    expect(verdictOfOrderStatus("placed")).toBe("paid");
    expect(verdictOfOrderStatus("completed")).toBe("paid");
    expect(verdictOfOrderStatus("payment_failed")).toBe("failed");
    expect(verdictOfOrderStatus("pending_payment")).toBe("pending");
  });
});

describe("settlePayment", () => {
  it("is paid when the server's verify says captured, without polling", async () => {
    const check = vi.fn();
    const result = await settlePayment({ verify: async () => verified("captured"), check });
    expect(result).toMatchObject({ outcome: "paid" });
    expect(check).not.toHaveBeenCalled();
  });

  it("is failed when verify says the payment failed", async () => {
    const result = await settlePayment({ verify: async () => verified("failed", true), check: vi.fn() });
    expect(result.outcome).toBe("failed");
  });

  it("polls the payment while verify says it is not decided, and is paid once the server says so", async () => {
    const { now, sleep } = clock();
    const check = vi.fn<(id: string | null) => Promise<"paid" | "failed" | "pending">>().mockResolvedValueOnce("pending").mockResolvedValueOnce("pending").mockResolvedValueOnce("paid");
    const result = await settlePayment({ verify: async () => verified("authorized", false), check, now, sleep, intervalMs: 1000 });
    expect(result.outcome).toBe("paid");
    expect(check).toHaveBeenCalledTimes(3);
    expect(check).toHaveBeenCalledWith("pay1");
  });

  it("never reports paid from the browser alone: a refused signature is rejected and not polled", async () => {
    const check = vi.fn();
    const verify = async () => {
      throw new ApiError(400, "INVALID_SIGNATURE", "bad");
    };
    expect(await settlePayment({ verify, check })).toEqual({ outcome: "rejected" });
    expect(check).not.toHaveBeenCalled();
  });

  it("keeps asking (by what the payment is for) when verify itself could not be reached", async () => {
    const { now, sleep } = clock();
    const check = vi.fn<(id: string | null) => Promise<"paid" | "failed" | "pending">>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("paid");
    const verify = async () => {
      throw new ApiError(0, "INTERNAL", "offline");
    };
    const result = await settlePayment({ verify, check, now, sleep, intervalMs: 500 });
    expect(result).toMatchObject({ outcome: "paid", payment: null });
    expect(check).toHaveBeenNthCalledWith(1, null);
  });

  it("gives up as unconfirmed at the deadline instead of claiming anything", async () => {
    const { now, sleep } = clock();
    const check = vi.fn(async () => "pending" as const);
    const result = await settlePayment({ verify: async () => verified("created", false), check, now, sleep, intervalMs: 1000, timeoutMs: 5000 });
    expect(result.outcome).toBe("unconfirmed");
    expect(check.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("stops polling when aborted", async () => {
    const controller = new AbortController();
    const check = vi.fn(async () => {
      controller.abort();
      return "pending" as const;
    });
    const { now, sleep } = clock();
    const result = await settlePayment({ verify: async () => verified("created", false), check, now, sleep, signal: controller.signal });
    expect(result.outcome).toBe("unconfirmed");
    expect(check).toHaveBeenCalledTimes(1);
  });
});

/** A stand-in Razorpay: the test decides what the customer does in the window. */
function fakeRazorpay(act: (options: RazorpayOptions, emit: (event: "payment.failed", payload: { error?: { description?: string } }) => void) => void) {
  const created: RazorpayOptions[] = [];
  class Fake implements RazorpayInstance {
    private listeners: ((r: { error?: { description?: string } }) => void)[] = [];
    constructor(private options: RazorpayOptions) {
      created.push(options);
    }
    on(_event: "payment.failed", cb: (r: { error?: { description?: string } }) => void) {
      this.listeners.push(cb);
    }
    open() {
      act(this.options, (_e, payload) => this.listeners.forEach((l) => l(payload)));
    }
  }
  return { Ctor: Fake, created };
}

const base = { key: "rzp_test_x", order_id: "order_X", amount: 5000, currency: "INR" as const, name: "Femxo" };

describe("runCheckout", () => {
  it("resolves with the success data the handler receives", async () => {
    const response = { razorpay_order_id: "order_X", razorpay_payment_id: "pay_Y", razorpay_signature: "sig" };
    const { Ctor, created } = fakeRazorpay((o) => o.handler?.(response));
    await expect(runCheckout(Ctor, base)).resolves.toEqual({ kind: "success", response });
    expect(created[0]).toMatchObject({ key: "rzp_test_x", order_id: "order_X", amount: 5000 });
  });

  it("resolves dismissed when the window is closed", async () => {
    const { Ctor } = fakeRazorpay((o) => o.modal?.ondismiss?.());
    await expect(runCheckout(Ctor, base)).resolves.toEqual({ kind: "dismissed", lastFailure: undefined });
  });

  it("remembers a failed attempt and reports it when the window is then closed", async () => {
    const { Ctor } = fakeRazorpay((o, emit) => {
      emit("payment.failed", { error: { description: "Card declined" } });
      o.modal?.ondismiss?.();
    });
    const outcome = await runCheckout(Ctor, base);
    expect(outcome).toMatchObject({ kind: "dismissed", lastFailure: { description: "Card declined" } });
  });

  it("lets the customer retry inside the window: a failure then a success is a success", async () => {
    const response = { razorpay_order_id: "order_X", razorpay_payment_id: "pay_Z", razorpay_signature: "sig2" };
    const { Ctor } = fakeRazorpay((o, emit) => {
      emit("payment.failed", { error: { description: "Card declined" } });
      o.handler?.(response);
    });
    await expect(runCheckout(Ctor, base)).resolves.toMatchObject({ kind: "success" });
  });

  it("settles once: a late dismiss after success changes nothing", async () => {
    const response = { razorpay_order_id: "a", razorpay_payment_id: "b", razorpay_signature: "c" };
    const { Ctor } = fakeRazorpay((o) => {
      o.handler?.(response);
      o.modal?.ondismiss?.();
    });
    await expect(runCheckout(Ctor, base)).resolves.toMatchObject({ kind: "success" });
  });
});

describe("failureText", () => {
  it("uses the provider's words, or a calm default", () => {
    expect(failureText({ description: " Card declined " })).toBe("Card declined");
    expect(failureText(undefined)).toMatch(/didn't go through/);
  });
});
