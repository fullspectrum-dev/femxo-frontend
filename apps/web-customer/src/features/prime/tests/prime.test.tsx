import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthApi, createPaymentApi, createPrimeApi, withAuth } from "@femxo/shared/api";
import type { AuthApi, PrimeApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import { ToastProvider } from "@femxo/ui";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { BirthdayBanner } from "../components/BirthdayBanner";
import { PrimePage } from "../components/PrimePage";
import { QrCode } from "../components/QrCode";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/prime" }));
// The payment sheet builds its own gateway client on first use; point it at the test backend.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getPaymentApi: () => testPayments() };
});

let backend: ReturnType<typeof createMockBackend>;
let auth: AuthApi;
let prime: PrimeApi;
let testPayments: () => ReturnType<typeof createPaymentApi>;
const clipboard = { writeText: vi.fn(async () => undefined) };

beforeEach(() => {
  push.mockClear();
  clipboard.writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  setAccessToken(undefined);
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  auth = createAuthApi(adapter);
  prime = createPrimeApi(adapter);
  testPayments = () => createPaymentApi(adapter);
});

async function signInAs(mobile: string) {
  const challenge = await auth.requestOtp(mobile);
  setAccessToken((await auth.verifyOtp(challenge.requestId, "123456")).accessToken);
}

const shell = (children: React.ReactNode) => (
  <ToastProvider>
    <SessionProvider auth={auth}>{children}</SessionProvider>
  </ToastProvider>
);

describe("QrCode", () => {
  it("draws the code as an image that says what it holds", () => {
    const { container } = render(<QrCode value="femxo:prime:FXP-000231" label="Membership QR code for FXP-000231" />);
    expect(screen.getByRole("img", { name: "Membership QR code for FXP-000231" })).toBeInTheDocument();
    expect(container.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(200);
  });
});

describe("PrimePage for a guest", () => {
  it("shows the plans and benefits, and sends joining through sign-in", async () => {
    const { container } = render(shell(<PrimePage prime={prime} auth={auth} />));
    expect(await screen.findByRole("heading", { name: "Prime Annual" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Join/ })).toHaveLength(3);
    expect(await axeViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Join Prime Monthly" }));
    expect(push).toHaveBeenCalledWith("/login?next=%2Fprime");
  });
});

describe("PrimePage for a customer", () => {
  it("joins: pays for a plan, and the membership card appears", async () => {
    await signInAs("9000000002");
    render(shell(<PrimePage prime={prime} auth={auth} />));
    await userEvent.click(await screen.findByRole("button", { name: "Join Prime Quarterly" }));
    const sheet = await screen.findByRole("dialog", { name: "Pay for your order" });
    await userEvent.click(within(sheet).getByRole("button", { name: /^Pay ₹/ }));
    expect(await screen.findByText(/Welcome to Prime/)).toBeInTheDocument();
    const card = await screen.findByRole("region", { name: "Your Prime membership" });
    expect(within(card).getByText(/FXP-\d{6}/)).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: /Membership QR code/ })).toBeInTheDocument();
    expect((await prime.membership()).active).toBe(true);
  });

  it("closing the payment sheet leaves them a non-member, with the order to pay later", async () => {
    await signInAs("9000000002");
    render(shell(<PrimePage prime={prime} auth={auth} />));
    await userEvent.click(await screen.findByRole("button", { name: "Join Prime Monthly" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Pay for your order" })).getByRole("button", { name: "Close" }));
    expect(await screen.findByText(/payment is waiting/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your Prime membership" })).not.toBeInTheDocument();
  });
});

describe("PrimePage for a member", () => {
  it("shows the card, validity, coupons and referral link, and passes axe", async () => {
    await signInAs("9000000003");
    const { container } = render(shell(<PrimePage prime={prime} auth={auth} />));
    const card = await screen.findByRole("region", { name: "Your Prime membership" });
    expect(within(card).getByText("FXP-000231")).toBeInTheDocument();
    expect(within(card).getByText(/Valid till/)).toBeInTheDocument();
    expect(await screen.findByText("PRIME15")).toBeInTheDocument();
    expect(await screen.findByText(/POOJA50/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("copies a coupon code and the referral link, and says so", async () => {
    await signInAs("9000000003");
    render(shell(<PrimePage prime={prime} auth={auth} />));
    await userEvent.click(await screen.findByRole("button", { name: "Copy code PRIME15" }));
    expect(clipboard.writeText).toHaveBeenCalledWith("PRIME15");
    expect(await screen.findByText("Code copied")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Copy referral link" }));
    expect(clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining("POOJA50"));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("shows the referral numbers", async () => {
    await signInAs("9000000003");
    render(shell(<PrimePage prime={prime} auth={auth} />));
    const referral = await screen.findByRole("region", { name: "Refer a friend" });
    expect(await within(referral).findByText("9")).toBeInTheDocument();
    expect(within(referral).getByText("4")).toBeInTheDocument();
  });

  it("tells a lapsed member their Prime ended, and offers to renew", async () => {
    await signInAs("9000000004");
    render(shell(<PrimePage prime={prime} auth={auth} />));
    expect(await screen.findByText(/Your Prime ended on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renew Prime Monthly" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your Prime membership" })).not.toBeInTheDocument();
  });
});

describe("BirthdayBanner", () => {
  it("greets a member on their birthday, with a coupon they can copy", async () => {
    await signInAs("9000000003");
    render(shell(<BirthdayBanner prime={prime} />));
    expect(await screen.findByText(/Happy birthday, Pooja/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Copy code BDAY-/ }));
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^BDAY-/));
  });

  it("shows nothing on any other day, and to guests", async () => {
    const { unmount } = render(shell(<BirthdayBanner prime={prime} />));
    await waitFor(() => expect(screen.queryByText(/birthday/i)).not.toBeInTheDocument());
    unmount();
    backend.clock.advance(86_400_000);
    await signInAs("9000000003");
    render(shell(<BirthdayBanner prime={prime} />));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByText(/Happy birthday/)).not.toBeInTheDocument();
  });

  it("can be dismissed for the day", async () => {
    await signInAs("9000000003");
    render(shell(<BirthdayBanner prime={prime} />));
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Happy birthday/)).not.toBeInTheDocument();
  });
});
