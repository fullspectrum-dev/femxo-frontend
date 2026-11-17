"use client";

import { useCallback } from "react";
import { verdictOfOrderStatus, verdictOfPayment } from "@femxo/shared";
import { userMessage } from "@femxo/shared/api";
import type { PaymentOrder } from "@femxo/shared/contracts";
import { useSession } from "@/features/auth/components/SessionProvider";
import { getOrdersApi } from "@/lib/api";
import { useOnlinePayment } from "./useOnlinePayment";
import type { PayResult } from "./useOnlinePayment";

export type OrderPayResult = PayResult | { kind: "error"; message: string };

/**
 * Pays an online order with Razorpay Checkout. Right after checkout the order's payment details are at hand; to pay again
 * (a closed window, a failed attempt, a returning customer) they are asked for with POST /orders/:id/pay, which hands back
 * the same Razorpay order while the window is open. Success is always read back from the server.
 */
export function useOrderPayment() {
  const { user } = useSession();
  const online = useOnlinePayment();

  const payOrder = useCallback(
    async (orderId: string, orderNumber: string, known?: PaymentOrder | null): Promise<OrderPayResult> => {
      const orders = getOrdersApi();
      let payment = known ?? null;
      if (!payment?.providerOrderId || !payment.keyId) {
        try {
          payment = await orders.pay(orderId);
        } catch (error) {
          return { kind: "error", message: userMessage(error) };
        }
      }
      if (!payment.providerOrderId || !payment.keyId) return { kind: "error", message: "Online payment isn't available right now. Please try again in a moment." };
      return online.pay({
        keyId: payment.keyId,
        providerOrderId: payment.providerOrderId,
        amountPaise: payment.amountPaise,
        description: `Order ${orderNumber}`,
        prefill: user ? { name: user.name || undefined, contact: `+91${user.phone}`, email: user.email ?? undefined } : undefined,
        verify: (success) => orders.verifyPayment(success),
        check: async (paymentId) => {
          if (paymentId) return verdictOfPayment(await orders.payment(paymentId));
          return verdictOfOrderStatus((await orders.get(orderId)).order.status);
        },
      });
    },
    [online, user]
  );

  return { phase: online.phase, payOrder };
}
