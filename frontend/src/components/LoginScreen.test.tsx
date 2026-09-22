import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import LoginScreen from "./LoginScreen";

describe("LoginScreen", () => {
  it("renders sign-in fields by default", () => {
    render(<LoginScreen />);
    expect(screen.getByRole("heading", { name: "Prelegal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("submitting with no input at all still logs in (fake auth, no validation)", async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(localStorage.getItem("prelegal.auth")).toBe("1");
  });

  it("submitting arbitrary email/password logs in", async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.type(screen.getByLabelText("Email"), "not-even-a-real-email");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(localStorage.getItem("prelegal.auth")).toBe("1");
  });

  it("switching to the sign-up tab changes the submit label and still logs in", async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.click(screen.getByRole("tab", { name: "Sign up" }));
    const submit = screen.getByRole("button", { name: "Create account" });
    await user.click(submit);
    expect(localStorage.getItem("prelegal.auth")).toBe("1");
  });
});
