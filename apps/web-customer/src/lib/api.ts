"use client";

import { apiMode } from "@femxo/shared";
import { createAddressApi, createAuthApi, createCartApi, createCheckoutApi, createPaymentApi, createHttpAdapter, createOrdersApi, createPrimeApi, createProductsApi, createSearchApi, createSupportApi, createWishlistApi, shareReads, withAuth } from "@femxo/shared/api";
import type { ApiAdapter } from "@femxo/shared/api";
import { loadMockRuntime } from "@/features/devtools/runtime";
import { getAccessToken } from "./token";

/*
 * The one place the storefront chooses its API: the in-browser mock or the
 * real backend (NEXT_PUBLIC_API_MODE). Features call these clients and never
 * know which they got.
 */

let adapter: ApiAdapter | undefined;

function authedAdapter() {
  if (!adapter) {
    // The mock backend is built the first time a request is sent (see runtime.ts), not when this client is made.
    const mock: ApiAdapter = { send: async (req) => (await loadMockRuntime())!.adapter.send(req) };
    const base = apiMode === "mock" ? mock : createHttpAdapter({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "" });
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
