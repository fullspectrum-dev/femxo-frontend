import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAddressApi, createAuthApi, createOrdersApi, createSupportApi, withAuth } from "@femxo/shared/api";
import type { AddressApi, AuthApi, SupportApi } from "@femxo/shared/api";
import { createMockBackend } from "@femxo/shared/demo";
import { ToastProvider } from "@femxo/ui";
import { axeViolations } from "@femxo/ui/testing/axe";
import { SessionProvider } from "@/features/auth/components/SessionProvider";
import { getAccessToken, setAccessToken } from "@/lib/token";
import { AccountHome } from "../components/AccountHome";
import { AddressBookPage } from "../components/AddressBookPage";
import { ProfilePage } from "../components/ProfilePage";
import { SupportPage } from "../components/SupportPage";
import { SupportThreadPage } from "../components/SupportThreadPage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useParams: () => ({ id: "ignored" }),
}));

let backend: ReturnType<typeof createMockBackend>;
let auth: AuthApi;
let addresses: AddressApi;
let support: SupportApi;
let orders: ReturnType<typeof createOrdersApi>;

beforeEach(async () => {
  setAccessToken(undefined);
  backend = createMockBackend({ storage: "memory", latency: false, realNow: () => Date.UTC(2026, 9, 24, 5, 0) });
  const adapter = withAuth(backend.adapter, getAccessToken);
  auth = createAuthApi(adapter);
  addresses = createAddressApi(adapter);
  support = createSupportApi(adapter);
  orders = createOrdersApi(adapter);
  setAccessToken((await auth.login("kiran.s@demo.femxo.test", "Demo@12345")).accessToken);
});

const shell = (children: React.ReactNode) => (
  <ToastProvider>
    <SessionProvider auth={auth}>{children}</SessionProvider>
  </ToastProvider>
);

describe("AccountHome", () => {
  it("links to every part of the account, and passes axe", async () => {
    const { container } = render(shell(<AccountHome />));
    await screen.findByRole("heading", { name: "Hello, Kiran Singh" });
    const nav = screen.getByRole("navigation", { name: "Your account" });
    const hrefs = within(nav).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/orders", "/wishlist", "/account/addresses", "/account/profile", "/account/support"]));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("ProfilePage", () => {
  it("shows the details and saves changes", async () => {
    render(shell(<ProfilePage auth={auth} />));
    const name = await screen.findByLabelText("Full name");
    expect(name).toHaveValue("Kiran Singh");
    await userEvent.clear(name);
    await userEvent.type(name, "Kiran Kumar Singh");
    await userEvent.type(screen.getByLabelText(/Birthday/), "1991-04-02");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Profile saved")).toBeInTheDocument();
    expect(await auth.me()).toMatchObject({ name: "Kiran Kumar Singh", birthday: "1991-04-02" });
  });

  it("checks the name and the email before saving", async () => {
    render(shell(<ProfilePage auth={auth} />));
    const name = await screen.findByLabelText("Full name");
    await userEvent.clear(name);
    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.type(screen.getByLabelText(/Email/), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("AddressBookPage", () => {
  it("lists the addresses with the default marked, and passes axe", async () => {
    const { container } = render(shell(<AddressBookPage api={addresses} />));
    const [home] = await addresses.list();
    expect(await screen.findByText(home!.line1, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("adds, edits and deletes an address", async () => {
    render(shell(<AddressBookPage api={addresses} />));
    await userEvent.click(await screen.findByRole("button", { name: "Add a new address" }));
    await userEvent.type(screen.getByLabelText("Full name"), "Asha Devi");
    await userEvent.type(screen.getByLabelText("Mobile number"), "9111111111");
    await userEvent.type(screen.getByLabelText("House no., building, street"), "12 Boring Road");
    await userEvent.type(screen.getByLabelText("City"), "Patna");
    await userEvent.type(screen.getByLabelText("District"), "Patna");
    await userEvent.type(screen.getByLabelText("Pincode"), "800001");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText(/12 Boring Road/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Edit address: Asha Devi/ }));
    const line = screen.getByLabelText("House no., building, street");
    await userEvent.clear(line);
    await userEvent.type(line, "7 Fraser Road");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText(/7 Fraser Road/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Delete address: Asha Devi/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this address?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete address" }));
    await waitFor(() => expect(screen.queryByText(/7 Fraser Road/)).not.toBeInTheDocument());
  });

  it("makes another address the default", async () => {
    await addresses.create({ name: "Asha Devi", mobile: "9111111111", line1: "12 Boring Road", city: "Patna", district: "Patna", state: "Bihar", pincode: "800001", isDefault: false });
    render(shell(<AddressBookPage api={addresses} />));
    await userEvent.click(await screen.findByRole("button", { name: /^Make default: Asha Devi/ }));
    await waitFor(async () => expect((await addresses.list()).find((entry) => entry.name === "Asha Devi")!.isDefault).toBe(true));
  });
});

describe("SupportPage", () => {
  it("shows the empty state, then raises a request tied to an order", async () => {
    const { container } = render(shell(<SupportPage support={support} orders={orders} />));
    expect(await screen.findByRole("heading", { name: "No requests yet" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "New request" }));
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText("Subject"), "Where is my order?");
    await userEvent.selectOptions(screen.getByLabelText("Topic"), "order");
    const orderSelect = screen.getByLabelText(/Order/);
    await waitFor(() => expect(within(orderSelect).getAllByRole("option").length).toBeGreaterThan(1));
    await userEvent.selectOptions(orderSelect, within(orderSelect).getAllByRole("option")[1]!);
    await userEvent.type(screen.getByLabelText("Message"), "It was due yesterday and I have heard nothing.");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("link", { name: /Where is my order\?/ })).toBeInTheDocument();
    expect((await support.list())[0]!.orderId).not.toBeNull();
  });
});

describe("SupportThreadPage", () => {
  it("shows the conversation, and a reply from support after a minute", async () => {
    const ticket = await support.create({ subject: "Where is my order?", category: "order", orderId: null, message: "It was due yesterday and I have heard nothing." });
    backend.clock.advance(60_000);
    setAccessToken((await auth.login("kiran.s@demo.femxo.test", "Demo@12345")).accessToken);
    const { container } = render(shell(<SupportThreadPage ticketId={ticket.id} support={support} />));
    expect(await screen.findByText("It was due yesterday and I have heard nothing.")).toBeInTheDocument();
    expect(await screen.findByText(/looking into this/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for you")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("sends a reply", async () => {
    const ticket = await support.create({ subject: "Where is my order?", category: "order", orderId: null, message: "It was due yesterday and I have heard nothing." });
    render(shell(<SupportThreadPage ticketId={ticket.id} support={support} />));
    await userEvent.type(await screen.findByLabelText("Your reply"), "Any news yet?");
    await userEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("Any news yet?")).toBeInTheDocument();
    expect((await support.get(ticket.id)).messages).toHaveLength(2);
  });

  it("says when the request isn't the customer's", async () => {
    render(shell(<SupportThreadPage ticketId="tkt-nope" support={support} />));
    expect(await screen.findByText("We couldn't find that request")).toBeInTheDocument();
  });
});
