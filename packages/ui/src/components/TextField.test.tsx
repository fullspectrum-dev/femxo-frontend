import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axeViolations } from "../test-utils/axe";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("labels its input", async () => {
    const { container } = render(<TextField label="Mobile number" name="mobile" />);
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute("name", "mobile");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("describes the input with its hint", () => {
    render(<TextField label="Email" hint="We'll only use it for receipts" />);
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("We'll only use it for receipts");
  });

  it("flags an error: invalid, announced, and read with the input", async () => {
    const { container } = render(<TextField label="Mobile number" hint="10 digits" error="Enter a 10-digit mobile number" />);
    const input = screen.getByLabelText("Mobile number");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10-digit mobile number");
    expect(input).toHaveAccessibleDescription(/Enter a 10-digit mobile number/);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("marks optional fields in text", () => {
    render(<TextField label="Email" optional />);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("passes typing through, and takes a ref for focus management", async () => {
    let element: HTMLInputElement | null = null;
    render(<TextField label="Name" ref={(node) => { element = node; }} />);
    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    expect(element!.value).toBe("Asha");
  });
});
