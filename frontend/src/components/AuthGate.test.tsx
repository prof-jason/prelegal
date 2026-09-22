import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AuthGate from "./AuthGate";
import { login } from "@/lib/auth";

describe("AuthGate", () => {
  it("shows the login screen when logged out", () => {
    render(
      <AuthGate>
        <p>Protected content</p>
      </AuthGate>,
    );
    expect(screen.getByRole("heading", { name: "Prelegal" })).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows the children (and a log out control) when already logged in", () => {
    login();
    render(
      <AuthGate>
        <p>Protected content</p>
      </AuthGate>,
    );
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("logging in via the login screen reveals the children without a remount", async () => {
    const user = userEvent.setup();
    render(
      <AuthGate>
        <p>Protected content</p>
      </AuthGate>,
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });

  it("logging out returns to the login screen", async () => {
    login();
    const user = userEvent.setup();
    render(
      <AuthGate>
        <p>Protected content</p>
      </AuthGate>,
    );
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Prelegal" })).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
