"use client";

import { apiMode } from "@femxo/shared";
import { createAuthApi, createHttpAdapter, createProductsApi, createSearchApi, withAuth } from "@femxo/shared/api";
import type { ApiAdapter } from "@femxo/shared/api";
import { getMockRuntime } from "@/features/devtools/runtime";
import { getAccessToken } from "./token";

/*
 * The one place the storefront chooses its API: the in-browser mock or the
 * real backend (NEXT_PUBLIC_API_MODE). Features call these clients and never
 * know which they got.
 */

let adapter: ApiAdapter | undefined;

function authedAdapter() {
  if (!adapter) {
    const base = apiMode === "mock" ? getMockRuntime()!.adapter : createHttpAdapter({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "" });
    adapter = withAuth(base, getAccessToken);
  }
  return adapter;
}

export const getAuthApi = () => createAuthApi(authedAdapter());
export const getSearchApi = () => createSearchApi(authedAdapter());
export const getProductsApi = () => createProductsApi(authedAdapter());
