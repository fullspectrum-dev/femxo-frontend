"use client";

import { createAddressApi, createAuthApi, createCartApi, createCheckoutApi, createHttpAdapter, createOrdersApi, createPaymentApi, createPrimeApi, createProductsApi, createSearchApi, createStoreAdapter, createSupportApi, createWishlistApi, shareReads, withAuth } from "@femxo/shared/api";
import type { ApiAdapter } from "@femxo/shared/api";
import { getAccessToken } from "./token";

/*
 * The one place the storefront builds its API clients, over femxo-backend. The browser calls
 * same-origin paths that Next forwards (next.config.ts), so no CORS setup is needed.
 */

let adapter: ApiAdapter | undefined;

function authedAdapter() {
  if (!adapter) {
    const base = createStoreAdapter(createHttpAdapter({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "" }));
    // Identical reads made together (two components, or React running an effect twice in development) go out once.
    adapter = shareReads(withAuth(base, getAccessToken));
  }
  return adapter;
}

export const getAuthApi = () => createAuthApi(authedAdapter());
export const getSearchApi = () => createSearchApi(authedAdapter());
export const getProductsApi = () => createProductsApi(authedAdapter());
export const getCartApi = () => createCartApi(authedAdapter());
export const getWishlistApi = () => createWishlistApi(authedAdapter());
export const getAddressApi = () => createAddressApi(authedAdapter());
export const getCheckoutApi = () => createCheckoutApi(authedAdapter());
export const getPaymentApi = () => createPaymentApi(authedAdapter());
export const getOrdersApi = () => createOrdersApi(authedAdapter());
export const getSupportApi = () => createSupportApi(authedAdapter());
export const getPrimeApi = () => createPrimeApi(authedAdapter());
