import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginScreen from "./LoginScreen";
import { ChatApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { testSession } from "@/test/session";

const logIn = vi.fn();
const signUp = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, logIn: (...a: unknown[]) => logIn(...a), signUp: (...a: unknown[]) => signUp(...a) };
});

beforeEach(() => {
  logIn.mockReset();
  signUp.mockReset();
});

type User = ReturnType<typeof userEvent.setup>;

const fill = async (user: User, fields: Record<string, string>) => {
  for (const [label, value] of Object.entries(fields)) await user.type(screen.getByLabelText(label), value);
};

const signUpTab = async (user: User) => user.click(screen.getByRole("tab", { name: "Sign up" }));

describe("LoginScreen: sign in", () => {
  it("renders the sign-in form by default, with no confirm-password field", () => {
    render(<LoginScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs in with the trimmed email and stores the session", async () => {
    logIn.mockResolvedValue(testSession());
    const user = userEvent.setup();
    render(<LoginScreen />);
    await fill(user, { Email: "  ada@example.com ", Password: "hunter22" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(logIn).toHaveBeenCalledWith("ada@example.com", "hunter22");
    expect(getToken()).toBe("test-token");
  });

  it("shows the server's error (e.g. wrong password) and stays signed out", async () => {
    logIn.mockRejectedValue(new ChatApiError("unknown_error", "Invalid email or password", 401));
    const user = userEvent.setup();
    render(<LoginScreen />);
    await fill(user, { Email: "ada@example.com", Password: "wrongpass" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(getToken()).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it.each([
    [{ Email: "not-an-email", Password: "hunter22" }, "Enter a valid email address."],
    [{ Email: "ada@example.com" }, "Enter your password."],
  ])("validates before calling the server (%o)", async (fields, message) => {
    const user = userEvent.setup();
    render(<LoginScreen />);
    await fill(user, fields);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(logIn).not.toHaveBeenCalled();
  });

  it("disables the submit button while signing in", async () => {
    logIn.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<LoginScreen />);
    await fill(user, { Email: "ada@example.com", Password: "hunter22" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  });
});

describe("LoginScreen: sign up", () => {
  it("creates an account (which signs straight in)", async () => {
    signUp.mockResolvedValue(testSession("new@example.com"));
    const user = userEvent.setup();
    render(<LoginScreen />);
    await signUpTab(user);
    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeInTheDocument();
    await fill(user, { Email: "new@example.com", Password: "hunter22", "Confirm password": "hunter22" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUp).toHaveBeenCalledWith("new@example.com", "hunter22");
    expect(getToken()).toBe("test-token");
  });

  it.each([
    [{ Email: "new@example.com", Password: "short", "Confirm password": "short" }, "at least 8 characters"],
    [{ Email: "new@example.com", Password: "hunter22", "Confirm password": "hunter23" }, "don't match"],
  ])("validates the password (%o)", async (fields, message) => {
    const user = userEvent.setup();
    render(<LoginScreen />);
    await signUpTab(user);
    await fill(user, fields);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows a taken email's error", async () => {
    signUp.mockRejectedValue(new ChatApiError("unknown_error", "Email already registered", 409));
    const user = userEvent.setup();
    render(<LoginScreen />);
    await signUpTab(user);
    await fill(user, { Email: "dup@example.com", Password: "hunter22", "Confirm password": "hunter22" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email already registered");
  });

  it("switching tabs clears the previous error", async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await signUpTab(user);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
