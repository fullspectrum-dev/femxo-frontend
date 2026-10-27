import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@femxo/shared/api";
import type { AuthApi } from "@femxo/shared/api";
import type { Customer, Session } from "@femxo/shared/contracts";
import { LoginFlow } from "../components/LoginFlow";
import { OtpInput } from "../components/OtpInput";
import { SessionProvider } from "../components/SessionProvider";
import { safeNextPath } from "../next-path";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(search),
}));

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "cus-1",
  name: "Pooja Kumari",
  mobile: "9000000003",
  email: null,
  birthday: null,
  isPrime: false,
  ...overrides,
});
const session = (isNewUser = false, user = customer()): Session => ({ accessToken: "token-1", expiresIn: 900, user, isNewUser });
const signedOut = () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "Please sign in."));

function fakeAuth(overrides: Partial<Record<keyof AuthApi, unknown>> = {}) {
  return {
    refresh: vi.fn(signedOut),
    logout: vi.fn(async () => undefined),
    requestOtp: vi.fn(async () => ({ requestId: "otp-1", resendAfterSeconds: 30, expiresInSeconds: 300 })),
    verifyOtp: vi.fn(async () => session()),
    completeSignup: vi.fn(async () => session(false, customer({ name: "Asha Devi" }))),
    login: vi.fn(async () => session(false, customer({ email: "kiran.s@demo.femxo.test" }))),
    ...overrides,
  } as unknown as AuthApi & Record<keyof AuthApi, ReturnType<typeof vi.fn>>;
}

function renderFlow(auth: ReturnType<typeof fakeAuth>, mode: "login" | "signup" = "login") {
  return render(
    <SessionProvider auth={auth}>
      <LoginFlow auth={auth} mode={mode} />
    </SessionProvider>
  );
}

async function enterMobile(mobile = "9000000003") {
  await userEvent.type(await screen.findByLabelText("Mobile number"), mobile);
  await userEvent.click(screen.getByRole("button", { name: "Get OTP" }));
}

async function enterCode(code: string) {
  await userEvent.click(screen.getByRole("textbox", { name: "Digit 1 of 6" }));
  await userEvent.keyboard(code);
}

beforeEach(() => {
  replace.mockClear();
  search = "";
});

describe("safeNextPath (no open redirects)", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/checkout/address")).toBe("/checkout/address");
    expect(safeNextPath("/p/edible-oil?variant=2")).toBe("/p/edible-oil?variant=2");
  });

  it("falls back for anything that could leave the site or isn't a path", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/	/evil.com", "evil", "", null, undefined]) {
      expect(safeNextPath(bad)).toBe("/");
    }
    expect(safeNextPath(null, "/")).toBe("/");
  });
});

describe("OtpInput", () => {
  function Harness({ onChange }: { onChange: (value: string) => void }) {
    return <OtpInput length={6} onChange={onChange} />;
  }

  it("is six labelled boxes in one group, the first one asking for the code from SMS", () => {
    render(<Harness onChange={() => undefined} />);
    expect(screen.getByRole("group", { name: "6-digit code" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByRole("textbox", { name: "Digit 1 of 6" })).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("moves forward as you type and ignores anything but digits", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Digit 1 of 6" }));
    await userEvent.keyboard("1a2");
    expect(screen.getByRole("textbox", { name: "Digit 3 of 6" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("12");
  });

  it("goes back on Backspace, and takes a pasted code in one go", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Digit 1 of 6" }));
    await userEvent.keyboard("12{Backspace}{Backspace}");
    expect(screen.getByRole("textbox", { name: "Digit 2 of 6" })).toHaveFocus();
    await userEvent.paste("987654 ");
    expect(onChange).toHaveBeenLastCalledWith("987654");
    expect(screen.getByRole("textbox", { name: "Digit 6 of 6" })).toHaveValue("4");
  });
});

describe("LoginFlow: mobile OTP", () => {
  it("checks the mobile number before asking for a code", async () => {
    const auth = fakeAuth();
    renderFlow(auth);
    await enterMobile("12345");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10-digit Indian mobile number");
    expect(auth.requestOtp).not.toHaveBeenCalled();
  });

  it("asks for the code, counts down to resend, and resends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = fakeAuth();
    renderFlow(auth);
    await enterMobile();
    expect(auth.requestOtp).toHaveBeenCalledWith("9000000003");
    expect(await screen.findByText("Resend code in 30s")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend code" })).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await userEvent.click(await screen.findByRole("button", { name: "Resend code" }));
    expect(auth.requestOtp).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Resend code in 30s")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("signs in an existing customer and returns them to where they were going", async () => {
    search = "next=%2Fcheckout%2Faddress";
    const auth = fakeAuth();
    renderFlow(auth);
    await enterMobile();
    await enterCode("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout/address"));
    expect(auth.verifyOtp).toHaveBeenCalledWith("otp-1", "123456");
  });

  it("takes a customer who came straight to sign in to the store, not their account page", async () => {
    const auth = fakeAuth();
    renderFlow(auth);
    await enterMobile();
    await enterCode("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("never sends a customer to an address off this site", async () => {
    search = "next=%2F%2Fevil.com";
    const auth = fakeAuth();
    renderFlow(auth);
    await enterMobile();
    await enterCode("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("asks a first-time customer for their name, then sends them to sign in with the account they made", async () => {
    search = "next=%2Fcart";
    const auth = fakeAuth({ verifyOtp: vi.fn(async () => session(true, customer({ name: "" }))) });
    renderFlow(auth);
    await enterMobile("9111111111");
    await enterCode("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

    expect(await screen.findByRole("heading", { name: "What should we call you?" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/name/i);
    expect(auth.completeSignup).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Your name/), "Asha Devi");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    // The account exists now; the customer signs in with it rather than being signed in on the spot.
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?created=1&mobile=9111111111&next=%2Fcart"));
    expect(auth.completeSignup).toHaveBeenCalledWith({ name: "Asha Devi", email: null });
    expect(auth.logout).toHaveBeenCalled();
  });

  it("goes back to the store home after sign-in when no page was asked for", async () => {
    const auth = fakeAuth({ verifyOtp: vi.fn(async () => session(true, customer({ name: "" }))) });
    renderFlow(auth, "signup");
    await enterMobile("9111111111");
    await enterCode("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    await userEvent.type(await screen.findByLabelText(/Your name/), "Asha Devi");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?created=1&mobile=9111111111"));
  });

  it("welcomes a customer who has just made an account, with their number filled in", async () => {
    search = "created=1&mobile=9111111111&next=%2Fcart";
    renderFlow(fakeAuth());
    expect(await screen.findByRole("status")).toHaveTextContent("Your account is ready. Sign in to start shopping.");
    expect(screen.getByLabelText("Mobile number")).toHaveValue("9111111111");
  });

  it("ignores a mobile number in the address that isn't one", async () => {
    search = "created=1&mobile=abc";
    renderFlow(fakeAuth());
    expect(await screen.findByLabelText("Mobile number")).toHaveValue("");
  });

  it("offers a new customer the way to create an account, and an existing one the way back", async () => {
    search = "next=%2Fcart";
    const { unmount } = renderFlow(fakeAuth());
    expect(await screen.findByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Fcart");
    unmount();
    renderFlow(fakeAuth(), "signup");
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fcart");
  });

  it("says how many tries are left after a wrong code", async () => {
    const auth = fakeAuth({ verifyOtp: vi.fn(async () => Promise.reject(new ApiError(422, "OTP_INVALID", "That code isn't right.", { attemptsLeft: 3 }))) });
    renderFlow(auth);
    await enterMobile();
    await enterCode("000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn't right. 3 tries left.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("stops after too many wrong codes and says for how long", async () => {
    const auth = fakeAuth({
      verifyOtp: vi.fn(async () => Promise.reject(new ApiError(429, "RATE_LIMITED", "Too many", { retryAfterSeconds: 900 }, 900))),
    });
    renderFlow(auth);
    await enterMobile();
    await enterCode("000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 15 minutes.");
    expect(screen.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
  });

  it("offers a new code when the old one has expired", async () => {
    const auth = fakeAuth({ verifyOtp: vi.fn(async () => Promise.reject(new ApiError(422, "OTP_EXPIRED", "expired"))) });
    renderFlow(auth);
    await enterMobile();
    await enterCode("123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code has expired.");
    expect(screen.getByRole("button", { name: "Change mobile number" })).toBeInTheDocument();
  });

  it("reports a rate-limited request for a code with the wait", async () => {
    const auth = fakeAuth({ requestOtp: vi.fn(async () => Promise.reject(new ApiError(429, "RATE_LIMITED", "wait", { retryAfterSeconds: 90 }, 90))) });
    renderFlow(auth);
    await enterMobile();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 2 minutes.");
  });

  it("lets you fix a mistyped number from the code step", async () => {
    const auth = fakeAuth();
    renderFlow(auth);
    await enterMobile();
    await userEvent.click(await screen.findByRole("button", { name: "Change mobile number" }));
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
  });

  it("shows the demo code while the store runs on the mock API", async () => {
    renderFlow(fakeAuth());
    await enterMobile();
    expect(await screen.findByText(/Demo: use code 123456/)).toBeInTheDocument();
  });
});

describe("LoginFlow: email and password", () => {
  async function openEmail() {
    await userEvent.click(await screen.findByRole("tab", { name: "Email" }));
  }

  it("signs in and returns to where the customer was going", async () => {
    search = "next=%2Faccount%2Forders";
    const auth = fakeAuth();
    renderFlow(auth);
    await openEmail();
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "kiran.s@demo.femxo.test");
    await userEvent.type(screen.getByLabelText("Password"), "Demo@12345");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/orders"));
    expect(auth.login).toHaveBeenCalledWith("kiran.s@demo.femxo.test", "Demo@12345");
  });

  it("shows the API's one message for a wrong email or password", async () => {
    const auth = fakeAuth({ login: vi.fn(async () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "Incorrect email or password."))) });
    renderFlow(auth);
    await openEmail();
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "kiran.s@demo.femxo.test");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("can show and hide the password", async () => {
    renderFlow(fakeAuth());
    await openEmail();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
  });
});

describe("LoginFlow: around the flow", () => {
  it("sends someone who is already signed in straight on", async () => {
    search = "next=%2Fcart";
    const auth = fakeAuth({ refresh: vi.fn(async () => session()) });
    renderFlow(auth);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
  });

  it("explains signup mode in its heading, with the same steps", async () => {
    renderFlow(fakeAuth(), "signup");
    expect(await screen.findByRole("heading", { level: 1, name: "Create your Femxo account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
  });
});
