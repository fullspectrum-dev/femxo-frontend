import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import type { Customer, Session } from "@femxo/shared/contracts";
import { createRefreshGate } from "../refresh-gate";
import { RequireCustomer, RequirePrime } from "../components/Guards";
import { SessionProvider, useSession } from "../components/SessionProvider";

const replace = vi.fn();
let pathname = "/cart";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "cus-1",
  name: "Pooja Kumari",
  mobile: "9000000003",
  email: null,
  birthday: null,
  isPrime: false,
  ...overrides,
});
const session = (user: Customer = customer(), isNewUser = false): Session => ({ accessToken: "token-1", expiresIn: 900, user, isNewUser });

function fakeAuth(overrides: Partial<Record<keyof AuthApi, unknown>> = {}) {
  return {
    refresh: vi.fn(async () => session()),
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => customer()),
    ...overrides,
  } as unknown as AuthApi & { refresh: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
}

function Probe() {
  const { status, user, signIn, signOut, retry } = useSession();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.name ?? "nobody"}</p>
      <button onClick={() => signIn(session(customer({ name: "Asha Devi" })))}>sign in</button>
      <button onClick={() => void signOut()}>sign out</button>
      <button onClick={retry}>retry</button>
    </div>
  );
}

const renderWith = (auth: AuthApi, children: React.ReactNode = <Probe />) =>
  render(<SessionProvider auth={auth}>{children}</SessionProvider>);

beforeEach(() => {
  replace.mockClear();
  pathname = "/cart";
});

describe("createRefreshGate (one refresh at a time; the backend revokes a session on reuse)", () => {
  it("shares one request between simultaneous callers", async () => {
    let calls = 0;
    const gate = createRefreshGate(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `token-${calls}`;
    });
    await expect(Promise.all([gate(), gate(), gate()])).resolves.toEqual(["token-1", "token-1", "token-1"]);
    expect(calls).toBe(1);
    await expect(gate()).resolves.toBe("token-2");
  });

  it("lets the next caller try again after a failure", async () => {
    let attempt = 0;
    const gate = createRefreshGate(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network");
      return "ok";
    });
    await expect(gate()).rejects.toThrow("network");
    await expect(gate()).resolves.toBe("ok");
  });
});

describe("SessionProvider", () => {
  it("starts by checking, then signs in when the refresh cookie is still good", async () => {
    renderWith(fakeAuth());
    expect(screen.getByTestId("status")).toHaveTextContent("checking");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));
    expect(screen.getByTestId("user")).toHaveTextContent("Pooja Kumari");
  });

  it("is signed out when there is no valid session (401)", async () => {
    renderWith(fakeAuth({ refresh: vi.fn(async () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "Please sign in."))) }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
  });

  it("says the session couldn't be checked when the network or server fails, and retries on request", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "INTERNAL", "offline"))
      .mockResolvedValueOnce(session());
    renderWith(fakeAuth({ refresh }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unavailable"));
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));
  });

  it("signs in from a fresh login, and out through the API", async () => {
    const auth = fakeAuth({ refresh: vi.fn(async () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "x"))) });
    renderWith(auth);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
    await userEvent.click(screen.getByRole("button", { name: "sign in" }));
    expect(screen.getByTestId("user")).toHaveTextContent("Asha Devi");
    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    expect(auth.logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
    expect(screen.getByTestId("user")).toHaveTextContent("nobody");
  });

  it("refreshes quietly before the access token runs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = fakeAuth();
    renderWith(auth);
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850_000);
    });
    expect(auth.refresh).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws a clear error outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/SessionProvider/);
  });
});

describe("RequireCustomer", () => {
  it("shows the page to a signed-in customer", async () => {
    renderWith(fakeAuth(), <RequireCustomer>Cart contents</RequireCustomer>);
    expect(await screen.findByText("Cart contents")).toBeInTheDocument();
  });

  it("holds the page back while checking", () => {
    renderWith(fakeAuth({ refresh: vi.fn(() => new Promise(() => undefined)) }), <RequireCustomer>Cart contents</RequireCustomer>);
    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
    expect(screen.queryByText("Cart contents")).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in and back to where they were", async () => {
    pathname = "/checkout/address";
    renderWith(fakeAuth({ refresh: vi.fn(async () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "x"))) }), <RequireCustomer>Secret</RequireCustomer>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fcheckout%2Faddress"));
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fcheckout%2Faddress");
  });

  it("lets a customer sign themselves out without bouncing them back to sign in", async () => {
    function SignOutButton() {
      const { signOut } = useSession();
      return <button onClick={() => void signOut()}>Sign out</button>;
    }
    const auth = fakeAuth();
    renderWith(auth, <RequireCustomer><SignOutButton /></RequireCustomer>);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(auth.logout).toHaveBeenCalledOnce());
    // The page that asked for the sign-out decides where to go; the guard only redirects sessions that ended on their own.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a retry when the session can't be checked, instead of signing the customer out", async () => {
    renderWith(fakeAuth({ refresh: vi.fn(async () => Promise.reject(new ApiError(0, "INTERNAL", "offline"))) }), <RequireCustomer>Secret</RequireCustomer>);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("RequirePrime", () => {
  it("shows Prime pages to members", async () => {
    renderWith(fakeAuth({ refresh: vi.fn(async () => session(customer({ isPrime: true }))) }), <RequirePrime>Membership card</RequirePrime>);
    expect(await screen.findByText("Membership card")).toBeInTheDocument();
  });

  it("invites everyone else to join Prime", async () => {
    renderWith(fakeAuth(), <RequirePrime>Membership card</RequirePrime>);
    expect(await screen.findByRole("heading", { name: "This is for Prime members" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Prime plans" })).toHaveAttribute("href", "/prime");
    expect(screen.queryByText("Membership card")).not.toBeInTheDocument();
  });
});
