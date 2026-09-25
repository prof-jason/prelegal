import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthGate from "./AuthGate";
import { endSession } from "@/lib/auth";
import { signIn } from "@/test/session";

const renderGate = () =>
  render(
    <AuthGate>
      <p>Protected content</p>
    </AuthGate>,
  );

describe("AuthGate", () => {
  it("shows the sign-in screen when signed out", () => {
    renderGate();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows the children when already signed in", () => {
    signIn();
    renderGate();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("reveals the children once a session starts, and returns to sign in when it ends", () => {
    renderGate();
    act(() => signIn());
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    act(() => endSession());
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
