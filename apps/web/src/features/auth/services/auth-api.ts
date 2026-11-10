import { createAuthClient, fetchTransport } from "./auth-client";

/** The app's one auth client: it holds the in-memory access token. */
export const authApi = createAuthClient(fetchTransport);
