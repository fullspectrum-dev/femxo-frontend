import type { ReactNode } from "react";
import type { AuthApi, CartApi, WishlistApi } from "@femxo/shared/api";
import type { Cart } from "@femxo/shared/contracts";
import { ToastProvider } from "@femxo/ui";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { WishlistProvider } from "@/features/wishlist/components/WishlistProvider";
import { CartProvider } from "@/features/cart/components/CartProvider";

export const emptyCart: Cart = {
  id: "crt-test",
  lines: [],
  coupon: null,
  breakup: { mrpTotal: 0, discount: 0, primeSavings: 0, couponDiscount: 0, delivery: 0, total: 0, gstIncluded: { cgst: 0, sgst: 0 }, youSave: 0 },
  itemCount: 0,
  expiresAt: "2026-11-01T00:00:00.000Z",
};

/** A cart client that always answers with an empty cart, for tests that only need the cart to exist. */
export const stubCartApi = () => {
  const answer = async () => emptyCart;
  return { get: answer, add: answer, setQuantity: answer, remove: answer, applyCoupon: answer, removeCoupon: answer, merge: answer } as unknown as CartApi;
};

/** A wishlist client with nothing saved. */
export const stubWishlistApi = () => {
  const answer = async () => ({ items: [] });
  return { list: answer, add: answer, remove: answer } as unknown as WishlistApi;
};

/** Session + cart + wishlist + toasts, the way the app's layout provides them. */
export function StorefrontProviders({ auth, cart = stubCartApi(), children }: { auth: AuthApi; cart?: CartApi; children: ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider auth={auth}>
        <CartProvider api={cart}>
          <WishlistProvider api={stubWishlistApi()}>{children}</WishlistProvider>
        </CartProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
